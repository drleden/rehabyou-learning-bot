"""
Telegram Bot — @rehabyoulearn_bot

Entrypoint: python bot.py   (runs as a separate Docker service alongside the API)

Commands:
  /start  — welcome message with WebApp button to open the Mini App
"""
import asyncio
import logging
import sys

from telegram import (
    Bot,
    BotCommand,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Update,
    WebAppInfo,
)
from telegram.ext import (
    Application,
    ApplicationBuilder,
    CommandHandler,
    ContextTypes,
)

from config import settings

logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

MINI_APP_URL = f"https://{settings.APP_DOMAIN}"


# ── Command handlers ──────────────────────────────────────────────────────────

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    first_name = user.first_name if user else "Привет"

    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton(
            text="📚 Открыть обучение",
            web_app=WebAppInfo(url=MINI_APP_URL),
        )
    ]])

    await update.message.reply_text(
        text=(
            f"👋 <b>Добро пожаловать, {first_name}!</b>\n\n"
            "Это образовательная платформа <b>Rehab.You</b> — "
            "обучение для мастеров и специалистов студии.\n\n"
            "Нажмите кнопку ниже, чтобы открыть платформу:"
        ),
        parse_mode="HTML",
        reply_markup=keyboard,
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        text=(
            "ℹ️ <b>Rehab.You Learning</b>\n\n"
            "Доступные команды:\n"
            "/start — открыть платформу обучения\n"
            "/help — справка\n\n"
            "По вопросам обращайтесь к администратору вашего филиала."
        ),
        parse_mode="HTML",
    )


# ── Bot setup ─────────────────────────────────────────────────────────────────

async def _set_commands(bot: Bot) -> None:
    """Register bot commands visible in the Telegram menu."""
    await bot.set_my_commands([
        BotCommand("start", "Открыть платформу обучения"),
        BotCommand("help", "Справка"),
    ])
    logger.info("Bot commands registered")


async def post_init(application: Application) -> None:
    await _set_commands(application.bot)
    info = await application.bot.get_me()
    logger.info("Bot started: @%s (id=%s)", info.username, info.id)


def build_application() -> Application:
    if not settings.TELEGRAM_BOT_TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not set in environment")

    app = (
        ApplicationBuilder()
        .token(settings.TELEGRAM_BOT_TOKEN)
        .post_init(post_init)
        .build()
    )

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))

    return app


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    logger.info("Starting Rehab.You bot (polling mode)…")
    app = build_application()
    # run_polling blocks until the process is stopped
    app.run_polling(
        allowed_updates=Update.ALL_TYPES,
        drop_pending_updates=True,
    )


if __name__ == "__main__":
    main()
