"""
Authentication endpoints.

- POST /api/auth/telegram   — Telegram Login Widget / Mini App init_data
- POST /api/auth/phone      — phone + password login
- POST /api/auth/refresh    — refresh JWT token
"""
from fastapi import APIRouter

router = APIRouter()


@router.post("/telegram")
async def telegram_auth():
    """Authenticate via Telegram Login Widget or Mini App initData."""
    raise NotImplementedError


@router.post("/phone")
async def phone_auth():
    """Authenticate via phone number and password."""
    raise NotImplementedError


@router.post("/refresh")
async def refresh_token():
    """Refresh JWT access token."""
    raise NotImplementedError
