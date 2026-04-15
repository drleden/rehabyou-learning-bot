import asyncio
import logging
import os

import aiohttp
from aiohttp import web
from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup, Update, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes

from database import get_pool, get_user_by_id, update_user_telegram
from notifications import (
    notify_course_completed,
    notify_lesson_reminder,
    notify_permission_granted,
    notify_test_failed,
    send_message,
)
from scheduler import setup_scheduler

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
log = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("ACADEMY_BOT_TOKEN", "")
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://app.rehabyou.site")
BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8001")
SUPERADMIN_PHONE = os.getenv("SUPERADMIN_PHONE", "")
SUPERADMIN_PASSWORD = os.getenv("SUPERADMIN_PASSWORD", "")


async def get_admin_token():
    """Login as superadmin and get JWT token."""
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{BACKEND_URL}/api/v1/auth/phone-login",
            json={"phone": SUPERADMIN_PHONE, "password": SUPERADMIN_PASSWORD},
            timeout=aiohttp.ClientTimeout(total=10),
        ) as r:
            if r.status != 200:
                log.error("Failed to login as superadmin: %s", r.status)
                return None
            data = await r.json()
            return data.get("access_token")


async def link_telegram_via_backend(user_id: int, telegram_id: int, telegram_username: str | None):
    """Call backend to link telegram_id to user."""
    token = await get_admin_token()
    if not token:
        return False
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{BACKEND_URL}/api/v1/auth/telegram/link-by-id",
            json={
                "user_id": user_id,
                "telegram_id": telegram_id,
                "telegram_username": telegram_username,
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=aiohttp.ClientTimeout(total=10),
        ) as r:
            return r.status in (200, 201)


async def start_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = context.args or []
    tg_user = update.effective_user

    if args and args[0].startswith("user_"):
        try:
            user_id = int(args[0].split("_", 1)[1])
        except ValueError:
            await update.message.reply_text("Некорректная ссылка.")
            return

        pool = context.application.bot_data.get("pool")
        db_user = await get_user_by_id(pool, user_id)
        if not db_user:
            await update.message.reply_text("Пользователь не найден.")
            return

        ok = await link_telegram_via_backend(user_id, tg_user.id, tg_user.username)
        if not ok:
            await update.message.reply_text("Не удалось подключить Telegram. Попробуйте позже.")
            return

        await update.message.reply_text(
            f"Привет, {db_user['first_name']}! Telegram подключён ✅\n\n"
            "Теперь буду присылать напоминания об обучении и важные уведомления."
        )
        return

    # Default welcome
    kb = InlineKeyboardMarkup([[
        InlineKeyboardButton(
            text="🎓 Открыть обучение",
            web_app=WebAppInfo(url=WEBAPP_URL),
        )
    ]])
    await update.message.reply_text(
        f"Привет, {tg_user.first_name or 'друг'}! 👋\n\n"
        "Я бот академии Rehab.You. Открой приложение, чтобы начать обучение 👇",
        reply_markup=kb,
    )


async def notify_handler(request: web.Request):
    """HTTP endpoint for backend to trigger notifications."""
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)

    bot: Bot = request.app["bot"]
    ntype = data.get("type")
    telegram_id = data.get("telegram_id")
    first_name = data.get("first_name", "")

    if not telegram_id:
        return web.json_response({"error": "telegram_id required"}, status=400)

    try:
        if ntype == "lesson_reminder":
            await notify_lesson_reminder(bot, first_name, telegram_id)
        elif ntype == "test_failed":
            await notify_test_failed(
                bot, first_name, telegram_id,
                int(data.get("score", 0)), int(data.get("threshold", 95)),
            )
        elif ntype == "course_completed":
            await notify_course_completed(
                bot, first_name, telegram_id, data.get("course_title", ""),
            )
        elif ntype == "permission_granted":
            await notify_permission_granted(
                bot, first_name, telegram_id, data.get("service_name", ""),
            )
        else:
            text = data.get("text", "")
            if text:
                await send_message(bot, telegram_id, text)
    except Exception as e:
        log.exception("notify failed: %s", e)
        return web.json_response({"error": str(e)}, status=500)

    return web.json_response({"ok": True})


async def main():
    if not BOT_TOKEN:
        log.error("ACADEMY_BOT_TOKEN is not set")
        return

    # Telegram bot
    application = Application.builder().token(BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start_handler))

    # DB pool
    pool = await get_pool()
    application.bot_data["pool"] = pool

    # HTTP server for backend notifications
    web_app = web.Application()
    web_app["bot"] = application.bot
    web_app.router.add_post("/notify", notify_handler)
    runner = web.AppRunner(web_app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", 8080)

    # Scheduler
    scheduler = setup_scheduler(application.bot, pool)

    # Start everything
    await application.initialize()
    await application.start()
    await application.updater.start_polling(drop_pending_updates=True)
    await site.start()
    scheduler.start()

    log.info("Academy bot started. HTTP server on :8080")

    try:
        await asyncio.Event().wait()
    finally:
        scheduler.shutdown()
        await application.updater.stop()
        await application.stop()
        await application.shutdown()
        await runner.cleanup()
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
