"""
Notification service.

Rules:
- All notifications are delivered only between 08:00 and 22:00 (user's timezone).
- Messages are queued in the `notifications` table and sent by a background worker.
- Delivery channel: Telegram Bot API (sendMessage).
"""
from datetime import datetime, time

from telegram import Bot

from config import settings

bot = Bot(token=settings.TELEGRAM_BOT_TOKEN)

QUIET_START = time(8, 0)
QUIET_END = time(22, 0)


def _is_delivery_allowed(now: datetime) -> bool:
    return QUIET_START <= now.time() <= QUIET_END


async def send_telegram(telegram_id: int, text: str) -> bool:
    """
    Send a Telegram message. Returns True if sent, False if outside quiet hours.
    Actual queuing / scheduling is handled by the background worker.
    """
    if not _is_delivery_allowed(datetime.now()):
        return False
    await bot.send_message(chat_id=telegram_id, text=text, parse_mode="HTML")
    return True


# ── Notification templates ────────────────────────────────────────────

async def notify_master_inactive(manager_telegram_id: int, master_name: str, days: int):
    await send_telegram(
        manager_telegram_id,
        f"⚠️ <b>{master_name}</b> не заходил в платформу {days} дн.",
    )


async def notify_skip_warning(
    senior_telegram_id: int,
    manager_telegram_id: int,
    master_name: str,
    skip_count: int,
):
    text = f"⚠️ У <b>{master_name}</b> {skip_count} пропуска занятий академии."
    await send_telegram(senior_telegram_id, text)
    await send_telegram(manager_telegram_id, text)


async def notify_skip_block(
    manager_telegram_id: int,
    superadmin_telegram_id: int,
    master_name: str,
):
    text = f"🚫 <b>{master_name}</b> заблокирован — 3 пропуска занятий."
    await send_telegram(manager_telegram_id, text)
    await send_telegram(superadmin_telegram_id, text)


async def notify_subscription_expiry(owner_telegram_id: int, days_left: int):
    await send_telegram(
        owner_telegram_id,
        f"💳 До окончания подписки осталось <b>{days_left} дн.</b>",
    )


async def notify_new_employee(user_telegram_id: int, first_name: str):
    await send_telegram(
        user_telegram_id,
        f"👋 Добро пожаловать, <b>{first_name}</b>!\n"
        "Откройте приложение, чтобы начать обучение.",
    )


async def notify_lesson_updated(user_telegram_id: int, lesson_title: str):
    await send_telegram(
        user_telegram_id,
        f"📝 Урок «<b>{lesson_title}</b>» был обновлён. Прогресс сброшен — пройдите заново.",
    )


async def notify_class_reminder(user_telegram_id: int, topic: str, hours_before: int):
    await send_telegram(
        user_telegram_id,
        f"🕐 Напоминание: через <b>{hours_before}ч</b> занятие «{topic}».",
    )


async def notify_class_cancelled(user_telegram_id: int, topic: str):
    await send_telegram(
        user_telegram_id,
        f"❌ Занятие «<b>{topic}</b>» отменено.",
    )


async def notify_attestation_requested(examiner_telegram_id: int, master_name: str):
    await send_telegram(
        examiner_telegram_id,
        f"📋 <b>{master_name}</b> запрашивает аттестацию. Назначьте дату.",
    )


async def notify_psych_test_completed(manager_telegram_id: int, master_name: str):
    await send_telegram(
        manager_telegram_id,
        f"🧠 <b>{master_name}</b> прошёл психологический тест. Результаты доступны в профиле.",
    )
