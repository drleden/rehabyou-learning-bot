"""
Authentication endpoints.

POST /api/auth/telegram  — Telegram Mini App (initData HMAC validation)
POST /api/auth/refresh   — Refresh access token via refresh token
GET  /api/auth/me        — Current user info (requires access token)
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from deps import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    validate_telegram_init_data,
)
from models.users import User, UserStatus

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class TelegramAuthRequest(BaseModel):
    init_data: str  # raw Telegram WebApp.initData string


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    telegram_id: int | None
    first_name: str | None
    last_name: str | None
    username: str | None
    phone: str
    roles: list[str]
    branch_ids: list[int]
    org_id: int | None
    status: str


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_or_create_user(tg_user: dict, db: AsyncSession) -> User:
    """Find user by telegram_id or create a new trial account."""
    telegram_id = tg_user["id"]

    result = await db.execute(
        select(User).where(User.telegram_id == telegram_id)
    )
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            telegram_id=telegram_id,
            first_name=tg_user.get("first_name"),
            last_name=tg_user.get("last_name"),
            username=tg_user.get("username"),
            phone="",  # phone is collected separately on first login
            roles=[],
            branch_ids=[],
            status=UserStatus.trial,
            last_active_at=datetime.now(timezone.utc),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        logger.info("Created new user telegram_id=%s", telegram_id)
    else:
        user.last_active_at = datetime.now(timezone.utc)
        await db.commit()

    return user


def _build_token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user),
        refresh_token=create_refresh_token(user),
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post(
    "/telegram",
    response_model=TokenResponse,
    summary="Авторизация через Telegram Mini App",
    description=(
        "Принимает `initData` из `window.Telegram.WebApp.initData`. "
        "Проверяет HMAC-подпись по алгоритму Telegram, затем выдаёт JWT."
    ),
)
async def telegram_auth(
    body: TelegramAuthRequest,
    db: AsyncSession = Depends(get_db),
):
    data = validate_telegram_init_data(body.init_data)

    tg_user = data.get("user")
    if not tg_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No user object in Telegram initData",
        )

    user = await _get_or_create_user(tg_user, db)

    if user.status == UserStatus.fired:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been deactivated",
        )
    if user.status == UserStatus.blocked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is blocked",
        )

    return _build_token_response(user)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Обновление access-токена",
)
async def refresh_token(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(body.refresh_token)

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Expected refresh token",
        )

    user_id = int(payload["sub"])
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if user.status in (UserStatus.fired, UserStatus.blocked):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is {user.status.value}",
        )

    return _build_token_response(user)


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Текущий пользователь",
)
async def get_me(user: User = Depends(get_current_user)):
    return UserResponse(
        id=user.id,
        telegram_id=user.telegram_id,
        first_name=user.first_name,
        last_name=user.last_name,
        username=user.username,
        phone=user.phone,
        roles=user.roles or [],
        branch_ids=user.branch_ids or [],
        org_id=user.org_id,
        status=user.status.value,
    )
