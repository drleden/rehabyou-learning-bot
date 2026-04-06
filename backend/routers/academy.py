"""
Academy (новички) — полная реализация.

GET    /api/academy/schedule                    — список занятий
POST   /api/academy/schedule                    — создать занятие
PUT    /api/academy/schedule/{id}               — редактировать
DELETE /api/academy/schedule/{id}               — отменить
POST   /api/academy/schedule/{id}/enroll        — записаться
DELETE /api/academy/schedule/{id}/enroll        — отписаться
POST   /api/academy/schedule/{id}/absence       — уведомить о неявке
GET    /api/academy/schedule/{id}/attendance    — список посещаемости (admin)
POST   /api/academy/schedule/{id}/attendance    — отметить посещаемость
GET    /api/academy/my-progress                 — мой прогресс (новичок)
GET    /api/academy/novice/{user_id}/journal    — журнал новичка
POST   /api/academy/attestation                 — запросить аттестацию
PUT    /api/academy/attestation/{id}            — обновить аттестацию
POST   /api/academy/skips/{user_id}/reset       — сбросить счётчик пропусков
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from deps import get_current_user, require_roles
from models.academy import (
    AcademyAttestation, AcademyAttendance, AcademyEnrollment,
    AcademyNoviceJournal, AcademyAbsenceNotice, AcademySchedule,
    AttestationResult, NoviceStatus, SkipCounter,
)
from models.users import User, UserStatus

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Role shortcuts ─────────────────────────────────────────────────────────────

MANAGE = ("teacher", "senior_master", "manager", "superadmin", "owner")
ATTEST_APPROVE = ("superadmin", "owner", "manager")

SKIP_LIMIT = 3
ATTEST_FREE_ATTEMPTS = 3


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_schedule(sid: int, db: AsyncSession) -> AcademySchedule:
    r = await db.execute(
        select(AcademySchedule)
        .where(AcademySchedule.id == sid)
        .options(
            selectinload(AcademySchedule.enrollments),
            selectinload(AcademySchedule.attendance),
        )
    )
    s = r.scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return s


async def _get_or_create_journal(user_id: int, db: AsyncSession) -> AcademyNoviceJournal:
    r = await db.execute(
        select(AcademyNoviceJournal).where(AcademyNoviceJournal.user_id == user_id)
    )
    j = r.scalar_one_or_none()
    if j is None:
        j = AcademyNoviceJournal(user_id=user_id)
        db.add(j)
        await db.flush()
    return j


async def _get_or_create_skip(user_id: int, db: AsyncSession) -> SkipCounter:
    r = await db.execute(
        select(SkipCounter).where(SkipCounter.user_id == user_id)
    )
    sc = r.scalar_one_or_none()
    if sc is None:
        sc = SkipCounter(user_id=user_id, count=0)
        db.add(sc)
        await db.flush()
    return sc


async def _check_and_apply_skip(user_id: int, schedule: AcademySchedule, db: AsyncSession):
    """Increment skip counter; block novice if limit reached."""
    # Was there an absence notice submitted ≥ 24h before class?
    notice_r = await db.execute(
        select(AcademyAbsenceNotice).where(
            AcademyAbsenceNotice.schedule_id == schedule.id,
            AcademyAbsenceNotice.user_id == user_id,
        )
    )
    notice = notice_r.scalar_one_or_none()
    counts_as_skip = True
    if notice:
        counts_as_skip = notice.counts_as_skip

    if not counts_as_skip:
        return  # Absence was properly notified — no skip

    sc = await _get_or_create_skip(user_id, db)
    sc.count = (sc.count or 0) + 1
    sc.last_skip_at = datetime.now(timezone.utc)
    logger.info("Skip counter for user %s incremented to %s", user_id, sc.count)

    if sc.count >= SKIP_LIMIT:
        journal = await _get_or_create_journal(user_id, db)
        if journal.status not in (NoviceStatus.blocked, NoviceStatus.full_certified):
            journal.status = NoviceStatus.blocked
            journal.updated_at = datetime.now(timezone.utc)
            logger.warning("User %s blocked — %s skips", user_id, sc.count)


def _schedule_out(s: AcademySchedule, user_id: Optional[int] = None) -> dict:
    enrolled_ids = {e.user_id for e in (s.enrollments or [])}
    attended_ids = {a.user_id for a in (s.attendance or [])}
    return {
        "id": s.id,
        "topic": s.topic,
        "description": s.description,
        "starts_at": s.starts_at.isoformat() if s.starts_at else None,
        "duration_minutes": s.duration_minutes,
        "is_cancelled": s.is_cancelled,
        "cancel_reason": s.cancel_reason,
        "enrolled_count": len(enrolled_ids),
        "is_enrolled": user_id in enrolled_ids if user_id else False,
        "attendance_taken": len(attended_ids) > 0,
    }


# ── Pydantic models ───────────────────────────────────────────────────────────

class CreateScheduleIn(BaseModel):
    branch_id: int
    topic: str
    description: Optional[str] = None
    starts_at: datetime
    duration_minutes: int = 60
    min_students: int = 1


class UpdateScheduleIn(BaseModel):
    topic: Optional[str] = None
    description: Optional[str] = None
    starts_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None


class AttendanceEntryIn(BaseModel):
    user_id: int
    was_present: bool
    score: Optional[float] = None
    comment: Optional[str] = None

    @field_validator("score")
    @classmethod
    def validate_score(cls, v):
        if v is not None and not (1 <= v <= 10):
            raise ValueError("score must be between 1 and 10")
        return v


class RecordAttendanceIn(BaseModel):
    entries: list[AttendanceEntryIn]


class AbsenceNoticeIn(BaseModel):
    reason: Optional[str] = None


class RequestAttestationIn(BaseModel):
    pass  # minimal


class UpdateAttestationIn(BaseModel):
    scheduled_at: Optional[datetime] = None
    result: Optional[AttestationResult] = None
    notes: Optional[str] = None
    approved_by: Optional[int] = None


# ── Schedule endpoints ────────────────────────────────────────────────────────

@router.get("/schedule", summary="Список занятий")
async def list_schedule(
    filter: str = Query("upcoming", regex="^(upcoming|past|all)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    q = (
        select(AcademySchedule)
        .options(
            selectinload(AcademySchedule.enrollments),
            selectinload(AcademySchedule.attendance),
        )
        .order_by(AcademySchedule.starts_at)
    )
    if filter == "upcoming":
        q = q.where(AcademySchedule.starts_at >= now, AcademySchedule.is_cancelled == False)  # noqa: E712
    elif filter == "past":
        q = q.where(AcademySchedule.starts_at < now)
    else:
        q = q.where(AcademySchedule.is_cancelled == False)  # noqa: E712

    r = await db.execute(q)
    items = r.scalars().all()
    return [_schedule_out(s, user.id) for s in items]


@router.post("/schedule", status_code=status.HTTP_201_CREATED, summary="Создать занятие")
async def create_schedule(
    body: CreateScheduleIn,
    user: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    s = AcademySchedule(
        branch_id=body.branch_id,
        teacher_id=user.id,
        topic=body.topic,
        description=body.description,
        starts_at=body.starts_at,
        duration_minutes=body.duration_minutes,
        min_students=body.min_students,
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return _schedule_out(s)


@router.put("/schedule/{schedule_id}", summary="Редактировать занятие")
async def update_schedule(
    schedule_id: int,
    body: UpdateScheduleIn,
    user: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    s = await _get_schedule(schedule_id, db)
    if body.topic is not None:
        s.topic = body.topic
    if body.description is not None:
        s.description = body.description
    if body.starts_at is not None:
        s.starts_at = body.starts_at
    if body.duration_minutes is not None:
        s.duration_minutes = body.duration_minutes
    await db.commit()
    await db.refresh(s)
    return _schedule_out(s)


@router.delete("/schedule/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Отменить занятие")
async def cancel_schedule(
    schedule_id: int,
    reason: Optional[str] = None,
    user: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    s = await _get_schedule(schedule_id, db)
    s.is_cancelled = True
    s.cancel_reason = reason
    await db.commit()
    logger.info("Schedule %s cancelled by user %s", schedule_id, user.id)


# ── Enrollment endpoints ──────────────────────────────────────────────────────

@router.post("/schedule/{schedule_id}/enroll", summary="Записаться на занятие")
async def enroll(
    schedule_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    s = await _get_schedule(schedule_id, db)
    if s.is_cancelled:
        raise HTTPException(status_code=400, detail="Class is cancelled")
    if s.starts_at and s.starts_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Class already started")

    already = any(e.user_id == user.id for e in s.enrollments)
    if already:
        raise HTTPException(status_code=409, detail="Already enrolled")

    db.add(AcademyEnrollment(schedule_id=schedule_id, user_id=user.id, is_mandatory=True))
    await db.commit()
    return {"ok": True}


@router.delete("/schedule/{schedule_id}/enroll", status_code=status.HTTP_204_NO_CONTENT, summary="Отписаться")
async def unenroll(
    schedule_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(
        select(AcademyEnrollment).where(
            AcademyEnrollment.schedule_id == schedule_id,
            AcademyEnrollment.user_id == user.id,
        )
    )
    enrollment = r.scalar_one_or_none()
    if enrollment is None:
        raise HTTPException(status_code=404, detail="Not enrolled")
    await db.delete(enrollment)
    await db.commit()


# ── Absence notice ────────────────────────────────────────────────────────────

@router.post("/schedule/{schedule_id}/absence", summary="Уведомить о неявке")
async def report_absence(
    schedule_id: int,
    body: AbsenceNoticeIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    s = await _get_schedule(schedule_id, db)
    now = datetime.now(timezone.utc)

    hours_before = (s.starts_at - now).total_seconds() / 3600 if s.starts_at else 0
    counts = hours_before < 24  # counts as skip if < 24h before class

    existing = await db.execute(
        select(AcademyAbsenceNotice).where(
            AcademyAbsenceNotice.schedule_id == schedule_id,
            AcademyAbsenceNotice.user_id == user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Absence notice already submitted")

    db.add(AcademyAbsenceNotice(
        schedule_id=schedule_id,
        user_id=user.id,
        reason=body.reason,
        hours_before_class=max(0, hours_before),
        counts_as_skip=counts,
    ))
    await db.commit()
    return {"ok": True, "counts_as_skip": counts, "hours_before": round(hours_before, 1)}


# ── Attendance ────────────────────────────────────────────────────────────────

@router.get("/schedule/{schedule_id}/attendance", summary="Список посещаемости")
async def get_attendance(
    schedule_id: int,
    user: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    s = await _get_schedule(schedule_id, db)
    enrolled_ids = [e.user_id for e in s.enrollments]

    # Load users
    users_r = await db.execute(select(User).where(User.id.in_(enrolled_ids)))
    users_map = {u.id: u for u in users_r.scalars().all()}

    # Load existing attendance
    att_r = await db.execute(
        select(AcademyAttendance).where(AcademyAttendance.schedule_id == schedule_id)
    )
    att_map = {a.user_id: a for a in att_r.scalars().all()}

    rows = []
    for uid in enrolled_ids:
        u = users_map.get(uid)
        a = att_map.get(uid)
        rows.append({
            "user_id": uid,
            "full_name": f"{u.last_name or ''} {u.first_name or ''}".strip() if u else str(uid),
            "was_present": a.was_present if a else None,
            "score": a.score if a else None,
            "comment": a.comment if a else None,
        })

    return {"schedule_id": schedule_id, "topic": s.topic, "starts_at": s.starts_at.isoformat() if s.starts_at else None, "rows": rows}


@router.post("/schedule/{schedule_id}/attendance", summary="Отметить посещаемость")
async def record_attendance(
    schedule_id: int,
    body: RecordAttendanceIn,
    recorder: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    s = await _get_schedule(schedule_id, db)

    for entry in body.entries:
        # Upsert attendance record
        r = await db.execute(
            select(AcademyAttendance).where(
                AcademyAttendance.schedule_id == schedule_id,
                AcademyAttendance.user_id == entry.user_id,
            )
        )
        att = r.scalar_one_or_none()
        if att is None:
            att = AcademyAttendance(
                schedule_id=schedule_id,
                user_id=entry.user_id,
                recorded_by=recorder.id,
            )
            db.add(att)

        att.was_present = entry.was_present
        att.score = entry.score
        att.comment = entry.comment
        att.recorded_at = datetime.now(timezone.utc)

        # Update journal: increment training hours if present
        if entry.was_present:
            journal = await _get_or_create_journal(entry.user_id, db)
            hours = (s.duration_minutes or 60) / 60
            journal.total_training_hours = (journal.total_training_hours or 0) + hours
            journal.updated_at = datetime.now(timezone.utc)
        else:
            await _check_and_apply_skip(entry.user_id, s, db)

    await db.commit()
    return {"ok": True, "recorded": len(body.entries)}


# ── My progress ───────────────────────────────────────────────────────────────

@router.get("/my-progress", summary="Мой прогресс в академии")
async def my_progress(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    journal = await _get_or_create_journal(user.id, db)
    skip_r = await db.execute(select(SkipCounter).where(SkipCounter.user_id == user.id))
    skip = skip_r.scalar_one_or_none()

    # Count attended classes
    att_r = await db.execute(
        select(AcademyAttendance).where(
            AcademyAttendance.user_id == user.id,
            AcademyAttendance.was_present == True,  # noqa: E712
        )
    )
    attended = len(att_r.scalars().all())

    # Latest attestation
    attest_r = await db.execute(
        select(AcademyAttestation)
        .where(AcademyAttestation.user_id == user.id)
        .order_by(AcademyAttestation.requested_at.desc())
        .limit(1)
    )
    latest_attest = attest_r.scalar_one_or_none()

    return {
        "status": journal.status,
        "total_training_hours": journal.total_training_hours or 0,
        "classes_attended": attended,
        "skip_count": skip.count if skip else 0,
        "can_request_attestation": journal.status == NoviceStatus.in_training and (skip.count if skip else 0) < SKIP_LIMIT,
        "latest_attestation": {
            "id": latest_attest.id,
            "attempt_number": latest_attest.attempt_number,
            "result": latest_attest.result,
            "scheduled_at": latest_attest.scheduled_at.isoformat() if latest_attest.scheduled_at else None,
        } if latest_attest else None,
    }


# ── Novice journal (admin) ────────────────────────────────────────────────────

@router.get("/novice/{user_id}/journal", summary="Журнал новичка")
async def get_novice_journal(
    user_id: int,
    _: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    journal = await _get_or_create_journal(user_id, db)
    skip_r = await db.execute(select(SkipCounter).where(SkipCounter.user_id == user_id))
    skip = skip_r.scalar_one_or_none()

    # Attendance history
    att_r = await db.execute(
        select(AcademyAttendance)
        .where(AcademyAttendance.user_id == user_id)
        .options(selectinload(AcademyAttendance.schedule))
        .order_by(AcademyAttendance.recorded_at.desc())
    )
    attendances = att_r.scalars().all()

    att_list = []
    for a in attendances:
        att_list.append({
            "schedule_id": a.schedule_id,
            "topic": a.schedule.topic if a.schedule else None,
            "starts_at": a.schedule.starts_at.isoformat() if a.schedule and a.schedule.starts_at else None,
            "was_present": a.was_present,
            "score": a.score,
            "comment": a.comment,
        })

    # Attestations
    attest_r = await db.execute(
        select(AcademyAttestation)
        .where(AcademyAttestation.user_id == user_id)
        .order_by(AcademyAttestation.requested_at.desc())
    )
    attestations = [
        {
            "id": a.id,
            "attempt_number": a.attempt_number,
            "requested_at": a.requested_at.isoformat(),
            "scheduled_at": a.scheduled_at.isoformat() if a.scheduled_at else None,
            "result": a.result,
            "notes": a.notes,
        }
        for a in attest_r.scalars().all()
    ]

    return {
        "user_id": user_id,
        "status": journal.status,
        "hired_at": journal.hired_at.isoformat() if journal.hired_at else None,
        "total_training_hours": journal.total_training_hours or 0,
        "skip_count": skip.count if skip else 0,
        "notes": journal.notes,
        "attendance": att_list,
        "attestations": attestations,
    }


# ── Attestation ───────────────────────────────────────────────────────────────

@router.post("/attestation", status_code=status.HTTP_201_CREATED, summary="Запросить аттестацию")
async def request_attestation(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    journal = await _get_or_create_journal(user.id, db)
    if journal.status == NoviceStatus.blocked:
        raise HTTPException(status_code=403, detail="Account is blocked")

    # Count existing attempts
    r = await db.execute(
        select(AcademyAttestation).where(AcademyAttestation.user_id == user.id)
    )
    existing = r.scalars().all()
    attempt_number = len(existing) + 1

    # 4th+ attempt needs prior approval
    if attempt_number > ATTEST_FREE_ATTEMPTS:
        approved = [a for a in existing if a.approved_by is not None]
        if not approved:
            raise HTTPException(
                status_code=403,
                detail=f"Attempt {attempt_number} requires approval from a manager or superadmin",
            )

    a = AcademyAttestation(user_id=user.id, attempt_number=attempt_number)
    db.add(a)
    await db.commit()
    await db.refresh(a)
    return {
        "id": a.id,
        "attempt_number": a.attempt_number,
        "result": a.result,
        "requested_at": a.requested_at.isoformat(),
    }


@router.put("/attestation/{attestation_id}", summary="Обновить аттестацию")
async def update_attestation(
    attestation_id: int,
    body: UpdateAttestationIn,
    user: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(
        select(AcademyAttestation).where(AcademyAttestation.id == attestation_id)
    )
    a = r.scalar_one_or_none()
    if a is None:
        raise HTTPException(status_code=404, detail="Attestation not found")

    if body.scheduled_at is not None:
        a.scheduled_at = body.scheduled_at
    if body.result is not None:
        a.result = body.result
        # If passed → update journal status
        if body.result == AttestationResult.passed:
            journal = await _get_or_create_journal(a.user_id, db)
            journal.status = NoviceStatus.base_certified if journal.status == NoviceStatus.in_training else NoviceStatus.full_certified
            journal.updated_at = datetime.now(timezone.utc)
    if body.notes is not None:
        a.notes = body.notes
    if body.approved_by is not None and any(r in user.roles for r in ATTEST_APPROVE):
        a.approved_by = body.approved_by
        a.approved_at = datetime.now(timezone.utc)

    await db.commit()
    return {
        "id": a.id,
        "attempt_number": a.attempt_number,
        "result": a.result,
        "scheduled_at": a.scheduled_at.isoformat() if a.scheduled_at else None,
        "notes": a.notes,
    }


# ── Skip counter reset (admin) ────────────────────────────────────────────────

@router.post("/skips/{user_id}/reset", summary="Сбросить счётчик пропусков")
async def reset_skips(
    user_id: int,
    admin: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    sc = await _get_or_create_skip(user_id, db)
    sc.count = 0
    sc.last_reset_by = admin.id
    sc.last_reset_at = datetime.now(timezone.utc)

    # If blocked due to skips → restore in_training
    journal = await _get_or_create_journal(user_id, db)
    if journal.status == NoviceStatus.blocked:
        journal.status = NoviceStatus.in_training
        journal.updated_at = datetime.now(timezone.utc)

    await db.commit()
    return {"ok": True, "skip_count": 0}
