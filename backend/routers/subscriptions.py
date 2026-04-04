"""
Subscription and payment endpoints.

Covers: current subscription, YooKassa payment initiation,
        promo code activation.
"""
from fastapi import APIRouter

router = APIRouter()


@router.get("/current")
async def current_subscription():
    raise NotImplementedError


@router.post("/pay")
async def initiate_payment():
    """Create YooKassa payment link."""
    raise NotImplementedError


@router.post("/yookassa/webhook")
async def yookassa_webhook():
    """Handle YooKassa payment confirmation."""
    raise NotImplementedError


@router.post("/promo")
async def activate_promo():
    raise NotImplementedError
