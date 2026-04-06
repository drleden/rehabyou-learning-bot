"""
Analytics endpoints.

GET /api/analytics/overview   — platform summary stats
GET /api/analytics/courses    — per-course conversion & progress
GET /api/analytics/staff      — per-staff member activity
GET /api/analytics/tests      — top-5 problematic tests
GET /api/analytics/inactive   — users inactive 3+ days
GET /api/analytics/academy    — academy attendance & status distribution

All endpoints require superadmin / owner / manager / admin role.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from deps import require_roles
from models.academy import (
    AcademyAttestation,
    AcademyAttendance,
    AcademyNoviceJournal,
    AttestationResult,
    NoviceStatus,
)
from models.courses import (
    Course,
    Lesson,
    LessonStatus,
    Module,
    Test,
    TestAttempt,
    UserProgress,
)
from models.users import User, UserStatus

router = APIRouter()

ANALYTICS_ROLES = ("superadmin", "owner", "manager", "admin")
LEARNER_ROLES = {"master", "senior_master", "teacher"}
INACTIVE_DAYS = 3


# ── Helper ────────────────────────────────────────────────────────────────────

def _days_ago(n: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=n)


# ── Overview ──────────────────────────────────────────────────────────────────

@router.get("/overview")
async def overview(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ANALYTICS_ROLES)),
):
    # Total non-fired staff
    total_users = (await db.execute(
        select(func.count(User.id))
        .where(User.status != UserStatus.fired)
    )).scalar() or 0

    # Active courses
    active_courses = (await db.execute(
        select(func.count(Course.id)).where(Course.is_active == True)
    )).scalar() or 0

    # Published lessons count
    total_lessons = (await db.execute(
        select(func.count(Lesson.id)).where(Lesson.status == LessonStatus.published)
    )).scalar() or 0

    # Completed lesson-user pairs
    total_completed = (await db.execute(
        select(func.count(UserProgress.id))
        .where(UserProgress.is_completed == True, UserProgress.is_archived == False)
    )).scalar() or 0

    # Avg progress across all users (denominator: active_users × total_lessons)
    active_learners = (await db.execute(
        select(func.count(func.distinct(UserProgress.user_id)))
    )).scalar() or 0

    if active_learners > 0 and total_lessons > 0:
        avg_progress = round(total_completed / (active_learners * total_lessons) * 100, 1)
    else:
        avg_progress = 0.0

    # Users who completed every published lesson in at least one course
    # Simplified: users with ≥1 completed progress who completed ratio ≥ 100%
    # We approximate: count users where all their assigned lesson-progress rows are completed
    fully_completed = 0
    if total_lessons > 0:
        per_user = (await db.execute(
            select(
                UserProgress.user_id,
                func.count(UserProgress.id).label("total"),
                func.sum(UserProgress.is_completed.cast("int")).label("done"),
            )
            .where(UserProgress.is_archived == False)
            .group_by(UserProgress.user_id)
        )).all()
        fully_completed = sum(1 for r in per_user if r.done and r.total and r.done >= r.total)

    # Inactive users (active status, not seen 3+ days)
    cutoff = _days_ago(INACTIVE_DAYS)
    inactive_count = (await db.execute(
        select(func.count(User.id))
        .where(
            User.status == UserStatus.active,
            and_(
                User.last_active_at != None,
                User.last_active_at < cutoff,
            ) if True else User.last_active_at < cutoff,
        )
    )).scalar() or 0

    # Also count users who have never logged in at all (last_active_at IS NULL)
    never_active = (await db.execute(
        select(func.count(User.id))
        .where(
            User.status == UserStatus.active,
            User.last_active_at == None,
        )
    )).scalar() or 0

    return {
        "total_users": total_users,
        "active_courses": active_courses,
        "avg_progress": avg_progress,
        "fully_completed_users": fully_completed,
        "inactive_count": inactive_count + never_active,
    }


# ── Courses ───────────────────────────────────────────────────────────────────

@router.get("/courses")
async def courses_analytics(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ANALYTICS_ROLES)),
):
    courses = (await db.execute(
        select(Course).where(Course.is_active == True).order_by(Course.id)
    )).scalars().all()

    result = []
    for course in courses:
        # Published lesson IDs for this course
        lesson_ids = (await db.execute(
            select(Lesson.id)
            .join(Module, Lesson.module_id == Module.id)
            .where(
                Module.course_id == course.id,
                Lesson.status == LessonStatus.published,
            )
        )).scalars().all()

        total_lessons = len(lesson_ids)
        if total_lessons == 0:
            result.append({
                "course_id": course.id,
                "title": course.title,
                "total_lessons": 0,
                "started": 0,
                "completed": 0,
                "avg_progress": 0.0,
                "conversion": 0.0,
            })
            continue

        # Per-user progress for this course
        per_user = (await db.execute(
            select(
                UserProgress.user_id,
                func.sum(UserProgress.is_completed.cast("int")).label("done"),
            )
            .where(
                UserProgress.lesson_id.in_(lesson_ids),
                UserProgress.is_archived == False,
            )
            .group_by(UserProgress.user_id)
        )).all()

        started = len(per_user)
        completed = sum(1 for r in per_user if r.done and r.done >= total_lessons)
        avg_progress = (
            sum(r.done / total_lessons * 100 for r in per_user if r.done) / started
            if started > 0 else 0.0
        )

        result.append({
            "course_id": course.id,
            "title": course.title,
            "total_lessons": total_lessons,
            "started": started,
            "completed": completed,
            "avg_progress": round(avg_progress, 1),
            "conversion": round(completed / started * 100, 1) if started > 0 else 0.0,
        })

    return result


# ── Staff ─────────────────────────────────────────────────────────────────────

@router.get("/staff")
async def staff_analytics(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ANALYTICS_ROLES)),
):
    users = (await db.execute(
        select(User)
        .where(User.status != UserStatus.fired)
        .order_by(User.first_name, User.last_name)
    )).scalars().all()

    # All published lessons count
    total_lessons = (await db.execute(
        select(func.count(Lesson.id)).where(Lesson.status == LessonStatus.published)
    )).scalar() or 1

    # Per-user progress summary
    progress_map = {}
    rows = (await db.execute(
        select(
            UserProgress.user_id,
            func.count(UserProgress.id).label("total"),
            func.sum(UserProgress.is_completed.cast("int")).label("done"),
        )
        .where(UserProgress.is_archived == False)
        .group_by(UserProgress.user_id)
    )).all()
    for r in rows:
        progress_map[r.user_id] = {
            "total": r.total or 0,
            "done": int(r.done or 0),
        }

    # Per-user test attempts
    attempt_map = {}
    att_rows = (await db.execute(
        select(
            TestAttempt.user_id,
            func.count(TestAttempt.id).label("cnt"),
        )
        .group_by(TestAttempt.user_id)
    )).all()
    for r in att_rows:
        attempt_map[r.user_id] = r.cnt

    # Academy statuses
    academy_map = {}
    jnl_rows = (await db.execute(select(AcademyNoviceJournal))).scalars().all()
    for j in jnl_rows:
        academy_map[j.user_id] = j.status.value

    cutoff = _days_ago(INACTIVE_DAYS)

    result = []
    for u in users:
        prog = progress_map.get(u.id, {"done": 0, "total": 0})
        done_pct = round(prog["done"] / total_lessons * 100, 1)
        is_inactive = u.last_active_at is None or u.last_active_at < cutoff

        result.append({
            "user_id": u.id,
            "first_name": u.first_name or "",
            "last_name": u.last_name or "",
            "roles": u.roles or [],
            "status": u.status.value,
            "last_active_at": u.last_active_at.isoformat() if u.last_active_at else None,
            "is_inactive": is_inactive,
            "progress_pct": done_pct,
            "completed_lessons": prog["done"],
            "test_attempts": attempt_map.get(u.id, 0),
            "academy_status": academy_map.get(u.id),
        })

    return result


# ── Problem tests ─────────────────────────────────────────────────────────────

@router.get("/tests")
async def tests_analytics(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ANALYTICS_ROLES)),
):
    # Group test attempts: total, avg_score, pass_rate — top 5 by attempt count
    rows = (await db.execute(
        select(
            TestAttempt.test_id,
            func.count(TestAttempt.id).label("total_attempts"),
            func.avg(TestAttempt.score).label("avg_score"),
            func.sum(TestAttempt.passed.cast("int")).label("passed_count"),
        )
        .group_by(TestAttempt.test_id)
        .order_by(func.count(TestAttempt.id).desc())
        .limit(5)
    )).all()

    if not rows:
        return []

    test_ids = [r.test_id for r in rows]

    # Resolve test → lesson title
    tests_info = (await db.execute(
        select(Test.id, Lesson.title, Lesson.id.label("lesson_id"))
        .join(Lesson, Test.lesson_id == Lesson.id)
        .where(Test.id.in_(test_ids))
    )).all()
    test_map = {t.id: {"lesson_title": t.title, "lesson_id": t.lesson_id} for t in tests_info}

    result = []
    for r in rows:
        info = test_map.get(r.test_id, {})
        total = r.total_attempts or 0
        passed = int(r.passed_count or 0)
        result.append({
            "test_id": r.test_id,
            "lesson_id": info.get("lesson_id"),
            "lesson_title": info.get("lesson_title", f"Тест #{r.test_id}"),
            "total_attempts": total,
            "avg_score": round((r.avg_score or 0) * 100, 1),
            "pass_rate": round(passed / total * 100, 1) if total > 0 else 0.0,
        })

    return result


# ── Inactive users ────────────────────────────────────────────────────────────

@router.get("/inactive")
async def inactive_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ANALYTICS_ROLES)),
):
    cutoff = _days_ago(INACTIVE_DAYS)

    users = (await db.execute(
        select(User)
        .where(
            User.status == UserStatus.active,
            (User.last_active_at == None) | (User.last_active_at < cutoff),
        )
        .order_by(User.last_active_at.asc().nullsfirst())
    )).scalars().all()

    now = datetime.now(timezone.utc)
    result = []
    for u in users:
        if u.last_active_at is None:
            days_inactive = None
        else:
            days_inactive = (now - u.last_active_at).days

        result.append({
            "user_id": u.id,
            "first_name": u.first_name or "",
            "last_name": u.last_name or "",
            "roles": u.roles or [],
            "last_active_at": u.last_active_at.isoformat() if u.last_active_at else None,
            "days_inactive": days_inactive,
        })

    return result


# ── Academy ───────────────────────────────────────────────────────────────────

@router.get("/academy")
async def academy_analytics(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*ANALYTICS_ROLES)),
):
    # Attendance: total records, attended, avg score
    att_rows = (await db.execute(
        select(
            func.count(AcademyAttendance.id).label("total"),
            func.sum(AcademyAttendance.was_present.cast("int")).label("present"),
            func.avg(AcademyAttendance.score).label("avg_score"),
        )
    )).one()

    total_att = att_rows.total or 0
    present = int(att_rows.present or 0)
    attendance_pct = round(present / total_att * 100, 1) if total_att > 0 else 0.0
    avg_score = round(att_rows.avg_score or 0, 1)

    # Novice journal status distribution
    status_rows = (await db.execute(
        select(
            AcademyNoviceJournal.status,
            func.count(AcademyNoviceJournal.id).label("cnt"),
        )
        .group_by(AcademyNoviceJournal.status)
    )).all()
    status_dist = {r.status.value: r.cnt for r in status_rows}

    # Attestation stats
    att_stats = (await db.execute(
        select(
            AcademyAttestation.result,
            func.count(AcademyAttestation.id).label("cnt"),
        )
        .group_by(AcademyAttestation.result)
    )).all()
    attest_dist = {r.result.value: r.cnt for r in att_stats}

    return {
        "total_attendance_records": total_att,
        "attendance_pct": attendance_pct,
        "avg_score": avg_score,
        "status_distribution": {
            "in_training": status_dist.get("in_training", 0),
            "base_certified": status_dist.get("base_certified", 0),
            "full_certified": status_dist.get("full_certified", 0),
            "blocked": status_dist.get("blocked", 0),
            "failed": status_dist.get("failed", 0),
        },
        "attestations": {
            "pending": attest_dist.get("pending", 0),
            "passed": attest_dist.get("passed", 0),
            "failed": attest_dist.get("failed", 0),
        },
    }
