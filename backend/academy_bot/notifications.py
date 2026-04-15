import logging

from telegram import Bot
from telegram.error import TelegramError

log = logging.getLogger(__name__)


async def send_message(bot: Bot, telegram_id: int, text: str):
    try:
        await bot.send_message(chat_id=telegram_id, text=text, parse_mode="HTML")
    except TelegramError as e:
        log.warning("Failed to send to %s: %s", telegram_id, e)


async def notify_lesson_reminder(bot: Bot, first_name: str, telegram_id: int):
    text = (
        f"👋 Привет, {first_name}!\n\n"
        "Ты давно не заглядывал в обучение. У тебя есть незавершённые курсы — "
        "давай продолжим? 📚"
    )
    await send_message(bot, telegram_id, text)


async def notify_test_failed(bot: Bot, first_name: str, telegram_id: int, score: int, threshold: int):
    text = (
        f"😔 {first_name}, тест не пройден.\n\n"
        f"Твой результат: <b>{score}%</b>\n"
        f"Нужно: <b>{threshold}%</b>\n\n"
        "Попробуй ещё раз — ты справишься!"
    )
    await send_message(bot, telegram_id, text)


async def notify_course_completed(bot: Bot, first_name: str, telegram_id: int, course_title: str):
    text = (
        f"🎉 Поздравляем, {first_name}!\n\n"
        f"Ты завершил курс <b>«{course_title}»</b>. "
        "Так держать! 💪"
    )
    await send_message(bot, telegram_id, text)


async def notify_permission_granted(bot: Bot, first_name: str, telegram_id: int, service_name: str):
    text = (
        f"✅ {first_name}, тебе выдан допуск!\n\n"
        f"Услуга: <b>{service_name}</b>\n\n"
        "Можешь начинать работать с клиентами."
    )
    await send_message(bot, telegram_id, text)
