"""
AI functionality endpoints.

POST /api/ai/check-assignment       — check assignment answer via Claude
POST /api/ai/assistant              — send message to AI assistant (manager+)
GET  /api/ai/assistant/me           — own conversation history
GET  /api/ai/assistant/{conv_id}    — conversation history by user_id
POST /api/ai/digest                 — generate on-demand AI digest (owner/superadmin)
POST /api/ai/interpret-psych        — interpret psychological test results
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from deps import get_current_user, require_roles
from models.courses import Lesson, TestAttempt, UserProgress
from models.academy import AcademyAttestation, AttestationResult
from models.integrations import AIConversation, AIReport
from models.users import User, UserStatus
from services import ai_service

logger = logging.getLogger(__name__)

router = APIRouter()

CHAT_ROLES   = ("superadmin", "owner", "manager", "admin")
DIGEST_ROLES = ("superadmin", "owner")


# ── Schemas ───────────────────────────────────────────────────────────────────

class AssignmentCheckIn(BaseModel):
    lesson_id: int
    answer_text: str


class ChatIn(BaseModel):
    message: str
    conversation_id: Optional[int] = None


class PsychInterpretIn(BaseModel):
    user_id: int
    test_result: dict
    test_name: str = "Психотест"


# ── Check assignment ──────────────────────────────────────────────────────────

@router.post("/check-assignment")
async def check_assignment(
    body: AssignmentCheckIn,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    lesson = await db.get(Lesson, body.lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")

    words = len(body.answer_text.split())
    if words < 50:
        return {
            "status": "rejected",
            "comment": f"Ответ слишком короткий ({words} слов). Минимум — 50 слов.",
        }

    try:
        return await ai_service.check_assignment(
            assignment_text=body.answer_text,
            lesson_topic=lesson.title,
        )
    except Exception as e:
        logger.error("AI check_assignment failed: %s", e)
        return {
            "status": "accepted",
            "comment": "Задание принято. ИИ-проверка временно недоступна.",
        }


# ── AI assistant chat ─────────────────────────────────────────────────────────

@router.post("/assistant")
async def assistant_chat(
    body: ChatIn,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(*CHAT_ROLES)),
):
    history_rows = (await db.execute(
        select(AIConversation)
        .where(AIConversation.user_id == actor.id)
        .order_by(AIConversation.created_at.desc())
        .limit(20)
    )).scalars().all()

    messages = [{"role": h.role, "content": h.content} for h in reversed(history_rows)]
    messages.append({"role": "user", "content": body.message})

    user_context = {
        "name": f"{actor.first_name or ''} {actor.last_name or ''}".strip(),
        "roles": actor.roles,
    }

    try:
        reply = await ai_service.chat(messages, user_context)
    except Exception as e:
        logger.error("AI assistant failed: %s", e)
        raise HTTPException(status_code=503, detail="ИИ-ассистент временно недоступен. Попробуйте позже.")

    db.add(AIConversation(user_id=actor.id, role="user",      content=body.message, model_used=settings.CLAUDE_MODEL))
    db.add(AIConversation(user_id=actor.id, role="assistant", content=reply,         model_used=settings.CLAUDE_MODEL))
    await db.commit()

    return {"message": reply, "conversation_id": actor.id}


# ── Conversation history ──────────────────────────────────────────────────────

def _fmt_history(rows):
    return [
        {
            "id": h.id,
            "role": h.role,
            "content": h.content,
            "created_at": h.created_at.isoformat() if h.created_at else None,
        }
        for h in rows
    ]


@router.get("/assistant/me")
async def my_history(
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(*CHAT_ROLES)),
):
    rows = (await db.execute(
        select(AIConversation)
        .where(AIConversation.user_id == actor.id)
        .order_by(AIConversation.created_at.asc())
        .limit(100)
    )).scalars().all()
    return _fmt_history(rows)


@router.get("/assistant/{conversation_id}")
async def get_history(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(*CHAT_ROLES)),
):
    target_uid = conversation_id
    if target_uid != actor.id and not any(r in actor.roles for r in ("superadmin", "owner")):
        raise HTTPException(status_code=403, detail="Нет доступа к этой переписке")

    rows = (await db.execute(
        select(AIConversation)
        .where(AIConversation.user_id == target_uid)
        .order_by(AIConversation.created_at.asc())
        .limit(100)
    )).scalars().all()
    return _fmt_history(rows)


# ── On-demand digest ──────────────────────────────────────────────────────────

@router.post("/digest")
async def generate_digest(
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(*DIGEST_ROLES)),
):
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    day3_ago = now - timedelta(days=3)

    total_staff = (await db.execute(
        select(func.count(User.id)).where(User.status != UserStatus.fired)
    )).scalar() or 0

    active_week = (await db.execute(
        select(func.count(User.id))
        .where(User.status == UserStatus.active, User.last_active_at >= week_ago)
    )).scalar() or 0

    inactive_3d = (await db.execute(
        select(func.count(User.id))
        .where(
            User.status == UserStatus.active,
            (User.last_active_at == None) | (User.last_active_at < day3_ago),
        )
    )).scalar() or 0

    completions_week = (await db.execute(
        select(func.count(UserProgress.id))
        .where(UserProgress.is_completed == True, UserProgress.completed_at >= week_ago)
    )).scalar() or 0

    test_total = (await db.execute(
        select(func.count(TestAttempt.id)).where(TestAttempt.created_at >= week_ago)
    )).scalar() or 0

    test_passed = (await db.execute(
        select(func.count(TestAttempt.id))
        .where(TestAttempt.created_at >= week_ago, TestAttempt.passed == True)
    )).scalar() or 0

    attestations_pending = (await db.execute(
        select(func.count(AcademyAttestation.id))
        .where(AcademyAttestation.result == AttestationResult.pending)
    )).scalar() or 0

    stats = {
        "период": "последние 7 дней",
        "всего_сотрудников": total_staff,
        "активных_за_неделю": active_week,
        "не_заходили_3_дня": inactive_3d,
        "уроков_завершено_за_неделю": completions_week,
        "тестов_попыток_за_неделю": test_total,
        "тестов_сдали_за_неделю": test_passed,
        "процент_сдачи_тестов": round(test_passed / test_total * 100, 1) if test_total else 0,
        "аттестаций_ожидают": attestations_pending,
    }

    try:
        digest_text = await ai_service.generate_digest(stats)
    except Exception as e:
        logger.error("AI digest failed: %s", e)
        raise HTTPException(status_code=503, detail="ИИ временно недоступен. Попробуйте позже.")

    db.add(AIReport(
        org_id=actor.org_id,
        requested_by=actor.id,
        report_type="on_demand",
        content=digest_text,
        model_used=settings.CLAUDE_MODEL,
    ))
    await db.commit()

    return {"digest": digest_text}


# ── Psych test interpretation ─────────────────────────────────────────────────

@router.post("/interpret-psych")
async def interpret_psych(
    body: PsychInterpretIn,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(*CHAT_ROLES)),
):
    target = await db.get(User, body.user_id)
    role = (target.roles[0] if target and target.roles else "master")

    try:
        interpretation = await ai_service.interpret_psych_test(
            raw_score=body.test_result,
            role=role,
            test_name=body.test_name,
        )
    except Exception as e:
        logger.error("AI psych interpretation failed: %s", e)
        raise HTTPException(status_code=503, detail="ИИ временно недоступен.")

    db.add(AIReport(
        requested_by=actor.id,
        report_type="psych_interpretation",
        content=interpretation,
        model_used=settings.CLAUDE_MODEL,
    ))
    await db.commit()

    return {"interpretation": interpretation}
