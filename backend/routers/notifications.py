"""
Notifications endpoints.

POST /api/notifications/send-digest  — manual digest trigger (superadmin/owner):
    generates AI digest, sends to all superadmin/owner Telegram IDs, returns text.
"""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from deps import require_roles
from models.courses import Lesson, Module, TestAttempt, UserProgress
from models.academy import AcademyAttestation, AttestationResult
from models.users import User, UserStatus
from services import ai_service
from services.notification_service import _tg_send

logger = logging.getLogger(__name__)
router = APIRouter()

DIGEST_ROLES = ("superadmin", "owner")


@router.post("/send-digest")
async def send_digest_manual(
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(*DIGEST_ROLES)),
):
    """
    Generate an AI digest for the past 7 days and send it via Telegram
    to all superadmin/owner users (+ config SUPERADMIN_TELEGRAM_IDS).
    Returns the digest text.
    """
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    day3_ago = now - timedelta(days=3)

    total_staff = (await db.execute(
        select(func.count(User.id)).where(User.status != UserStatus.fired)
    )).scalar() or 0

    active_week = (await db.execute(
        select(func.count(User.id)).where(
            User.status == UserStatus.active,
            User.last_active_at >= week_ago,
        )
    )).scalar() or 0

    inactive_3d = (await db.execute(
        select(func.count(User.id)).where(
            User.status == UserStatus.active,
            (User.last_active_at.is_(None)) | (User.last_active_at < day3_ago),
        )
    )).scalar() or 0

    completions_week = (await db.execute(
        select(func.count(UserProgress.id)).where(
            UserProgress.is_completed == True,
            UserProgress.completed_at >= week_ago,
        )
    )).scalar() or 0

    test_total = (await db.execute(
        select(func.count(TestAttempt.id)).where(TestAttempt.created_at >= week_ago)
    )).scalar() or 0

    test_passed = (await db.execute(
        select(func.count(TestAttempt.id)).where(
            TestAttempt.created_at >= week_ago,
            TestAttempt.passed == True,
        )
    )).scalar() or 0

    attestations_pending = (await db.execute(
        select(func.count(AcademyAttestation.id)).where(
            AcademyAttestation.result == AttestationResult.pending,
        )
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
        raise HTTPException(status_code=503, detail="ИИ временно недоступен.")

    msg = f"📊 <b>ИИ-дайджест (ручной запрос)</b>\n\n{digest_text}"

    # Send to config-level superadmin IDs
    sent_ids: set[int] = set()
    for tg_id in settings.superadmin_ids:
        await _tg_send(tg_id, msg)
        sent_ids.add(tg_id)

    # Send to all owner/superadmin users in DB
    admins_q = await db.execute(
        select(User).where(
            User.status == UserStatus.active,
            User.roles.overlap(list(DIGEST_ROLES)),
            User.telegram_id.isnot(None),
        )
    )
    for admin in admins_q.scalars().all():
        if admin.telegram_id not in sent_ids:
            await _tg_send(admin.telegram_id, msg)
            sent_ids.add(admin.telegram_id)

    logger.info("Manual digest sent to %d recipients by user %s", len(sent_ids), actor.id)
    return {"digest": digest_text, "sent_to": len(sent_ids)}
