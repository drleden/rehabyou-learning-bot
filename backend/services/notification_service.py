"""
Notification service — direct Telegram Bot API (no third-party library).

Rules:
- Delivery only between 08:00 and 22:00 MSK.
- Outside the window → write to `notifications` table with is_sent=False.
- flush_pending() is called by the scheduler every 30 min to drain the queue.
"""
import logging
from datetime import datetime, timezone, timedelta

import httpx

from config import settings

logger = logging.getLogger(__name__)

MSK = timezone(timedelta(hours=3))
QUIET_START = 8   # inclusive
QUIET_END   = 22  # exclusive


def _now_msk() -> datetime:
    return datetime.now(MSK)


def _is_delivery_allowed() -> bool:
    h = _now_msk().hour
    return QUIET_START <= h < QUIET_END


async def _tg_send(telegram_id: int, text: str) -> bool:
    """Fire-and-forget POST to Telegram sendMessage. Returns True on success."""
    if not settings.TELEGRAM_BOT_TOKEN:
        logger.debug("TELEGRAM_BOT_TOKEN not set — skipping send to %s", telegram_id)
        return False
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json={
                "chat_id": telegram_id,
                "text": text,
                "parse_mode": "HTML",
            })
            if not resp.is_success:
                logger.warning("Telegram API error %d for chat %s: %s",
                               resp.status_code, telegram_id, resp.text[:200])
                return False
        return True
    except Exception as exc:
        logger.warning("Telegram send failed for chat %s: %s", telegram_id, exc)
        return False


async def send_notification(db, user_id: int, telegram_id: int | None,
                            text: str, notif_type: str = "general") -> None:
    """
    Send immediately if within delivery window, otherwise queue in DB.

    Args:
        db:           AsyncSession (can be None — then always sends directly)
        user_id:      internal user id (for DB record)
        telegram_id:  Telegram chat_id (can be None — skips send)
        text:         message text
        notif_type:   value for notifications.type
    """
    from models.users import Notification  # local import to avoid circular

    if telegram_id and _is_delivery_allowed():
        sent = await _tg_send(telegram_id, text)
        if sent:
            if db:
                db.add(Notification(
                    user_id=user_id,
                    type=notif_type,
                    payload=text,
                    is_sent=True,
                    sent_at=_now_msk(),
                ))
                await db.commit()
            return

    # Outside window or send failed — queue for later
    if db:
        db.add(Notification(
            user_id=user_id,
            type=notif_type,
            payload=text,
            is_sent=False,
            scheduled_at=_now_msk(),
        ))
        await db.commit()
        logger.info("Notification queued for user %s (type=%s)", user_id, notif_type)


async def flush_pending(db) -> int:
    """
    Send all pending (is_sent=False) notifications if within delivery window.
    Returns number of messages sent.
    """
    if not _is_delivery_allowed():
        return 0

    from sqlalchemy import select, update
    from models.users import Notification

    rows = await db.execute(
        select(Notification)
        .where(Notification.is_sent == False)
        .order_by(Notification.created_at)
        .limit(100)
    )
    pending = rows.scalars().all()
    sent_count = 0
    for notif in pending:
        # We need telegram_id — fetch user
        from models.users import User
        user = await db.get(User, notif.user_id)
        if not user or not user.telegram_id:
            continue
        ok = await _tg_send(user.telegram_id, notif.payload or "")
        if ok:
            notif.is_sent = True
            notif.sent_at = _now_msk()
            sent_count += 1
    if sent_count:
        await db.commit()
        logger.info("Flushed %d pending notifications", sent_count)
    return sent_count
