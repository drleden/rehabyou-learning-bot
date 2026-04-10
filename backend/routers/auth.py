"""
Authentication endpoints.

POST /api/auth/telegram             — Telegram Mini App (initData HMAC)
POST /api/auth/phone                — Browser fallback: phone only
POST /api/auth/login-password       — Login by phone + password
POST /api/auth/set-password         — Set / change own password
POST /api/auth/reset-password/{id}  — Reset any user's password (admin)
GET  /api/auth/view-password/{id}   — View plain-text password (superadmin/assist)
POST /api/auth/refresh              — Refresh access token
GET  /api/auth/me                   — Current user info
"""
import logging
import random
import string
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from passlib.context import CryptContext
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

# Telegram ID of the assistant (@buyanova_kseniyaa) who has admin-level access
ASSISTANT_TG_ID = 302817128

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _gen_password(length: int = 8) -> str:
    chars = string.ascii_letters + string.digits
    return "".join(random.choices(chars, k=length))


# ── Schemas ───────────────────────────────────────────────────────────────────

class TelegramAuthRequest(BaseModel):
    init_data: str


class PhoneAuthRequest(BaseModel):
    phone: str


class PasswordLoginRequest(BaseModel):
    phone: str
    password: str


class SetPasswordRequest(BaseModel):
    old_password: str | None = None
    new_password: str


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
    telegram_id = tg_user["id"]
    result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            telegram_id=telegram_id,
            first_name=tg_user.get("first_name"),
            last_name=tg_user.get("last_name"),
            username=tg_user.get("username"),
            phone="",
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


def _check_active(user: User) -> None:
    if user.status == UserStatus.fired:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Аккаунт деактивирован")
    if user.status == UserStatus.blocked:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Аккаунт заблокирован")


def _normalize_phone(raw: str) -> str:
    phone = "".join(c for c in raw if c.isdigit() or c == "+")
    if len(phone) < 10:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Некорректный номер телефона"
        )
    return phone


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/telegram", response_model=TokenResponse, summary="Авторизация через Telegram Mini App")
async def telegram_auth(body: TelegramAuthRequest, db: AsyncSession = Depends(get_db)):
    data = validate_telegram_init_data(body.init_data)
    tg_user = data.get("user")
    if not tg_user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No user object in Telegram initData")

    user = await _get_or_create_user(tg_user, db)
    _check_active(user)
    return _build_token_response(user)


@router.post("/phone", response_model=TokenResponse, summary="Авторизация по номеру телефона")
async def phone_auth(body: PhoneAuthRequest, db: AsyncSession = Depends(get_db)):
    phone = _normalize_phone(body.phone)
    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Пользователь с таким номером не найден. Обратитесь к администратору.",
        )
    _check_active(user)
    user.last_active_at = datetime.now(timezone.utc)
    await db.commit()
    return _build_token_response(user)


@router.post("/login-password", response_model=TokenResponse, summary="Вход по телефону и паролю")
async def login_password(body: PasswordLoginRequest, db: AsyncSession = Depends(get_db)):
    phone = _normalize_phone(body.phone)
    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Пользователь с таким номером не найден")
    if not user.password_hash:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Пароль не установлен. Обратитесь к администратору.")
    if not pwd_ctx.verify(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный пароль")
    _check_active(user)

    user.last_active_at = datetime.now(timezone.utc)
    await db.commit()
    return _build_token_response(user)


@router.post("/set-password", summary="Установить / изменить свой пароль")
async def set_password(
    body: SetPasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.password_hash:
        if not body.old_password:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Введите текущий пароль")
        if not pwd_ctx.verify(body.old_password, user.password_hash):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Неверный текущий пароль")

    if len(body.new_password) < 6:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Минимум 6 символов")

    user.password_hash = pwd_ctx.hash(body.new_password)
    user.password_plain = body.new_password
    await db.commit()
    return {"ok": True}


@router.post("/reset-password/{user_id}", summary="Сбросить пароль пользователя (admin)")
async def reset_password(
    user_id: int,
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    actor_roles = actor.roles or []
    can_reset = (
        "superadmin" in actor_roles
        or "manager" in actor_roles
        or "owner" in actor_roles
        or actor.telegram_id == ASSISTANT_TG_ID
    )
    if not can_reset:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Недостаточно прав")

    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Пользователь не найден")

    new_pwd = _gen_password()
    target.password_hash = pwd_ctx.hash(new_pwd)
    target.password_plain = new_pwd
    await db.commit()
    return {"password": new_pwd}


@router.get("/view-password/{user_id}", summary="Посмотреть пароль пользователя (superadmin)")
async def view_password(
    user_id: int,
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    actor_roles = actor.roles or []
    can_view = "superadmin" in actor_roles or actor.telegram_id == ASSISTANT_TG_ID
    if not can_view:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Недостаточно прав")

    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Пользователь не найден")

    return {"password": target.password_plain}


@router.post("/refresh", response_model=TokenResponse, summary="Обновление access-токена")
async def refresh_token(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Expected refresh token")

    user_id = int(payload["sub"])
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    if user.status in (UserStatus.fired, UserStatus.blocked):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Account is {user.status.value}")

    return _build_token_response(user)


@router.get("/me", response_model=UserResponse, summary="Текущий пользователь")
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
