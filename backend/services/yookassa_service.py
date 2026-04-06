"""
YooKassa payment service.

Uses YooKassa REST API directly via httpx (no third-party SDK).
Credentials: YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY from env.

Docs: https://yookassa.ru/developers/api
"""
import logging
import uuid

import httpx

from config import settings

logger = logging.getLogger(__name__)

_BASE = "https://api.yookassa.ru/v3"


def _auth() -> tuple[str, str]:
    return (settings.YOOKASSA_SHOP_ID, settings.YOOKASSA_SECRET_KEY)


def _is_configured() -> bool:
    return bool(settings.YOOKASSA_SHOP_ID and settings.YOOKASSA_SECRET_KEY)


async def create_payment(
    amount_kopecks: int,
    description: str,
    org_id: int,
    return_url: str,
    plan_name: str = "",
) -> dict:
    """
    Create a YooKassa payment.

    Returns:
        {
            "yookassa_id": str,
            "confirmation_url": str,
            "status": "pending",
        }

    Raises:
        RuntimeError if YooKassa is not configured or API returns error.
    """
    if not _is_configured():
        raise RuntimeError("YooKassa не настроен: заполните YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY")

    idempotency_key = str(uuid.uuid4())
    payload = {
        "amount": {
            "value": f"{amount_kopecks / 100:.2f}",
            "currency": "RUB",
        },
        "confirmation": {
            "type": "redirect",
            "return_url": return_url,
        },
        "description": description,
        "metadata": {
            "org_id": str(org_id),
            "plan_name": plan_name,
        },
        "capture": True,
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{_BASE}/payments",
                json=payload,
                auth=_auth(),
                headers={"Idempotence-Key": idempotency_key},
            )
            data = resp.json()
            if not resp.is_success:
                logger.error("YooKassa create_payment error %d: %s", resp.status_code, data)
                raise RuntimeError(data.get("description", "Ошибка создания платежа"))
    except httpx.HTTPError as exc:
        logger.error("YooKassa network error: %s", exc)
        raise RuntimeError(f"Сетевая ошибка: {exc}") from exc

    return {
        "yookassa_id": data["id"],
        "confirmation_url": data["confirmation"]["confirmation_url"],
        "status": data["status"],
    }


async def check_payment(payment_id: str) -> dict:
    """
    Check YooKassa payment status.

    Returns:
        {
            "id": str,
            "status": "pending" | "waiting_for_capture" | "succeeded" | "canceled",
            "paid": bool,
            "amount": {"value": "...", "currency": "RUB"},
        }
    """
    if not _is_configured():
        raise RuntimeError("YooKassa не настроен")

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{_BASE}/payments/{payment_id}",
                auth=_auth(),
            )
            data = resp.json()
            if not resp.is_success:
                logger.error("YooKassa check_payment error %d: %s", resp.status_code, data)
                raise RuntimeError(data.get("description", "Ошибка проверки платежа"))
    except httpx.HTTPError as exc:
        logger.error("YooKassa network error: %s", exc)
        raise RuntimeError(f"Сетевая ошибка: {exc}") from exc

    return data
