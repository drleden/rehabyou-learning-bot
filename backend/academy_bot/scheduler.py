import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from telegram import Bot

from database import get_inactive_users
from notifications import notify_lesson_reminder

log = logging.getLogger(__name__)


def setup_scheduler(bot: Bot, pool) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="Europe/Moscow")

    async def daily_reminder_job():
        log.info("Running daily reminder job")
        try:
            users = await get_inactive_users(pool, days=3)
            for u in users:
                await notify_lesson_reminder(bot, u["first_name"], u["telegram_id"])
            log.info("Sent %d reminders", len(users))
        except Exception as e:
            log.exception("Daily reminder job failed: %s", e)

    scheduler.add_job(
        daily_reminder_job,
        trigger=CronTrigger(hour=10, minute=0),
        id="daily_reminder",
        replace_existing=True,
    )

    return scheduler
