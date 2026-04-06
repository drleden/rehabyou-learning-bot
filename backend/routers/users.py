"""
User management endpoints.

GET  /api/users              — list employees (filter: role, status, branch_id, search)
POST /api/users/invite       — invite/create employee by telegram_id or phone
POST /api/users/me/init      — upsert profile on first launch
GET  /api/users/me           — current user profile
GET  /api/users/{id}         — user by ID
PATCH /api/users/{id}/role   — assign role
PATCH /api/users/{id}/fire   — deactivate (уволить)
PATCH /api/users/{id}/block  — block
PATCH /api/users/{id}/unblock— unblock
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from deps import get_current_user, require_roles
from models.users import User, UserStatus

logger = logging.getLogger(__name__)

router = APIRouter()

MANAGE_ROLES = ("superadmin", "owner", "admin", "manager")

# ── Schemas ───────────────────────────────────────────────────────────────────

class UserProfile(BaseModel):
    id: int
    telegram_id: Optional[int]
    first_name: Optional[str]
    last_name: Optional[str]
    username: Optional[str]
    phone: str
    roles: list[str]
    branch_ids: list[int]
    org_id: Optional[int]
    status: str
    hired_at: Optional[datetime]
    last_active_at: Optional[datetime]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class InitRequest(BaseModel):
    phone: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class InviteRequest(BaseModel):
    telegram_id: Optional[int] = None
    phone: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    roles: list[str] = []
    branch_ids: list[int] = []


class RoleRequest(BaseModel):
    roles: list[str]


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


async def _get_or_404(user_id: int, db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


# ── List ──────────────────────────────────────────────────────────────────────

@router.get(
    "/",
    response_model=list[UserProfile],
    summary="Список сотрудников",
)
async def list_users(
    role: Optional[str]   = Query(None, description="Фильтр по роли"),
    user_status: Optional[str] = Query(None, alias="status", description="Фильтр по статусу"),
    branch_id: Optional[int]  = Query(None, description="Фильтр по филиалу"),
    search: Optional[str]     = Query(None, description="Поиск по имени/телефону"),
    limit: int  = Query(100, le=500),
    offset: int = Query(0, ge=0),
    _caller: User = Depends(require_roles(*MANAGE_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    q = select(User)

    if user_status:
        try:
            q = q.where(User.status == UserStatus(user_status))
        except ValueError:
            pass  # ignore unknown status values

    q = q.order_by(User.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(q)
    users: list[User] = list(result.scalars().all())

    # In-Python filters for ARRAY columns and text search
    if role:
        users = [u for u in users if role in (u.roles or [])]
    if branch_id:
        users = [u for u in users if branch_id in (u.branch_ids or [])]
    if search:
        s = search.lower()
        users = [
            u for u in users
            if s in (u.first_name or "").lower()
            or s in (u.last_name or "").lower()
            or s in (u.phone or "").lower()
            or s in (u.username or "").lower()
        ]

    return [_profile(u) for u in users]


# ── Invite ────────────────────────────────────────────────────────────────────

@router.post(
    "/invite",
    response_model=UserProfile,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить сотрудника",
)
async def invite_user(
    body: InviteRequest,
    _caller: User = Depends(require_roles(*MANAGE_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    if not body.telegram_id and not body.phone:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Укажите telegram_id или phone",
        )

    # Check if already exists
    if body.telegram_id:
        result = await db.execute(select(User).where(User.telegram_id == body.telegram_id))
        existing = result.scalar_one_or_none()
        if existing:
            # Update roles/branches and activate
            existing.roles = body.roles or existing.roles
            existing.branch_ids = body.branch_ids or existing.branch_ids
            if existing.status == UserStatus.trial:
                existing.status = UserStatus.active
                existing.hired_at = datetime.now(timezone.utc)
            await db.commit()
            await db.refresh(existing)
            return _profile(existing)

    phone = ""
    if body.phone:
        phone = "".join(c for c in body.phone if c.isdigit() or c == "+")

    new_user = User(
        telegram_id=body.telegram_id,
        phone=phone,
        first_name=body.first_name,
        last_name=body.last_name,
        roles=body.roles,
        branch_ids=body.branch_ids,
        status=UserStatus.active,
        hired_at=datetime.now(timezone.utc),
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    logger.info("Invited new user: id=%s telegram_id=%s", new_user.id, new_user.telegram_id)
    return _profile(new_user)


# ── Me endpoints (must come before /{user_id}) ────────────────────────────────

@router.post(
    "/me/init",
    response_model=UserProfile,
    summary="Инициализация профиля при первом входе",
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
    await db.commit()
    if changed:
        await db.refresh(user)
    return _profile(user)


@router.get(
    "/me",
    response_model=UserProfile,
    summary="Профиль текущего пользователя",
)
async def get_me(user: User = Depends(get_current_user)):
    return _profile(user)


# ── Individual user actions ───────────────────────────────────────────────────

@router.get(
    "/{user_id}",
    response_model=UserProfile,
    summary="Профиль пользователя по ID",
)
async def get_user(
    user_id: int,
    _caller: User = Depends(require_roles(*MANAGE_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    return _profile(await _get_or_404(user_id, db))


@router.patch(
    "/{user_id}/role",
    response_model=UserProfile,
    summary="Назначить роль сотруднику",
)
async def set_role(
    user_id: int,
    body: RoleRequest,
    _caller: User = Depends(require_roles("superadmin", "owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_or_404(user_id, db)
    user.roles = body.roles
    await db.commit()
    await db.refresh(user)
    logger.info("Roles updated for user_id=%s: %s", user_id, body.roles)
    return _profile(user)


@router.patch(
    "/{user_id}/fire",
    response_model=UserProfile,
    summary="Уволить сотрудника",
)
async def fire_user(
    user_id: int,
    _caller: User = Depends(require_roles("superadmin", "owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_or_404(user_id, db)
    user.status = UserStatus.fired
    user.fired_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return _profile(user)


@router.patch(
    "/{user_id}/block",
    response_model=UserProfile,
    summary="Заблокировать сотрудника",
)
async def block_user(
    user_id: int,
    _caller: User = Depends(require_roles("superadmin", "owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_or_404(user_id, db)
    user.status = UserStatus.blocked
    await db.commit()
    await db.refresh(user)
    return _profile(user)


@router.patch(
    "/{user_id}/unblock",
    response_model=UserProfile,
    summary="Разблокировать сотрудника",
)
async def unblock_user(
    user_id: int,
    _caller: User = Depends(require_roles("superadmin", "owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_or_404(user_id, db)
    user.status = UserStatus.active
    await db.commit()
    await db.refresh(user)
    return _profile(user)
