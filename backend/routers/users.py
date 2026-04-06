"""
User management endpoints.

POST /api/users/me/init   — Upsert user profile on first launch, return full profile
GET  /api/users/me        — Current user profile
GET  /api/users/{user_id} — Get user by ID (admin/manager only)
POST /api/users/          — Create user manually (admin only)
PATCH /api/users/{user_id} — Update user (admin only)
POST /api/users/{user_id}/fire  — Deactivate user (admin only)
POST /api/users/{user_id}/roles — Assign roles (admin only)
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from deps import get_current_user, require_roles
from models.users import User, UserStatus

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class UserProfile(BaseModel):
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
    hired_at: datetime | None
    last_active_at: datetime | None
    created_at: datetime | None

    class Config:
        from_attributes = True


class InitRequest(BaseModel):
    """Optional fields the client can send on first launch."""
    phone: str | None = None
    first_name: str | None = None
    last_name: str | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _profile(user: User) -> UserProfile:
    return UserProfile(
        id=user.id,
        telegram_id=user.telegram_id,
        first_name=user.first_name,
        last_name=user.last_name,
        username=user.username,
        phone=user.phone or "",
        roles=user.roles or [],
        branch_ids=user.branch_ids or [],
        org_id=user.org_id,
        status=user.status.value,
        hired_at=user.hired_at,
        last_active_at=user.last_active_at,
        created_at=user.created_at,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post(
    "/me/init",
    response_model=UserProfile,
    summary="Инициализация профиля при первом входе",
    description=(
        "Вызывается фронтендом сразу после успешной авторизации. "
        "Обновляет phone/first_name/last_name если они ещё не заданы, "
        "и возвращает полный профиль пользователя."
    ),
)
async def init_user_profile(
    body: InitRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    changed = False

    if body.phone and not user.phone:
        phone = "".join(c for c in body.phone if c.isdigit() or c == "+")
        if phone:
            user.phone = phone
            changed = True

    if body.first_name and not user.first_name:
        user.first_name = body.first_name[:100]
        changed = True

    if body.last_name and not user.last_name:
        user.last_name = body.last_name[:100]
        changed = True

    user.last_active_at = datetime.now(timezone.utc)

    if changed:
        await db.commit()
        await db.refresh(user)
        logger.info("Initialised profile for user_id=%s", user.id)
    else:
        await db.commit()

    return _profile(user)


@router.get(
    "/me",
    response_model=UserProfile,
    summary="Профиль текущего пользователя",
)
async def get_me(user: User = Depends(get_current_user)):
    return _profile(user)


@router.get(
    "/{user_id}",
    response_model=UserProfile,
    summary="Профиль пользователя по ID",
)
async def get_user(
    user_id: int,
    _caller: User = Depends(require_roles("superadmin", "owner", "admin", "manager")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _profile(user)


@router.post(
    "/{user_id}/fire",
    response_model=UserProfile,
    summary="Уволить сотрудника",
)
async def fire_user(
    user_id: int,
    _caller: User = Depends(require_roles("superadmin", "owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.status = UserStatus.fired
    user.fired_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return _profile(user)


@router.post(
    "/{user_id}/roles",
    response_model=UserProfile,
    summary="Назначить роли пользователю",
)
async def assign_role(
    user_id: int,
    roles: list[str],
    _caller: User = Depends(require_roles("superadmin", "owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.roles = roles
    await db.commit()
    await db.refresh(user)
    return _profile(user)
