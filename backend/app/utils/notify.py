import logging
import os

import httpx

log = logging.getLogger(__name__)

BOT_NOTIFY_URL = os.getenv("BOT_NOTIFY_URL", "http://academy-bot:8080/notify")


async def notify_bot(payload: dict) -> None:
    """Fire-and-forget notification to academy bot. Never raises."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(BOT_NOTIFY_URL, json=payload)
    except Exception as e:
        log.warning("Failed to notify bot: %s", e)
