"""
Service permissions endpoints.

GET  /api/services                             — list all services (with auto-seed)
POST /api/services                             — add service (superadmin/owner/manager)
GET  /api/services/permissions/{user_id}       — permissions for a specific user
POST /api/services/permissions                 — grant permission
DELETE /api/services/permissions/{uid}/{sid}   — revoke permission
GET  /api/services/permissions/{user_id}/history — change history
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from deps import get_current_user, require_roles
from models.services import (
    PermissionStatus,
    Service,
    ServicePermissionHistory,
    SERVICE_LIST,
    UserServicePermission,
)
from models.users import User

router = APIRouter()

MANAGE_ROLES = ("superadmin", "owner", "manager", "admin")


# ── Seed helper ───────────────────────────────────────────────────────────────

async def _ensure_seeded(db: AsyncSession) -> None:
    """Insert the 7 default services if the table is empty."""
    result = await db.execute(select(Service).limit(1))
    if result.scalar_one_or_none() is None:
        for name in SERVICE_LIST:
            db.add(Service(name=name, is_active=True))
        await db.commit()


# ── Schemas ───────────────────────────────────────────────────────────────────

class ServiceOut(BaseModel):
    id: int
    name: str
    description: str | None
    is_active: bool

    class Config:
        from_attributes = True


class ServiceCreate(BaseModel):
    name: str
    description: str | None = None


class PermissionOut(BaseModel):
    service_id: int
    service_name: str
    status: PermissionStatus


class GrantBody(BaseModel):
    user_id: int
    service_id: int


class HistoryOut(BaseModel):
    id: int
    service_id: int
    service_name: str
    old_status: PermissionStatus | None
    new_status: PermissionStatus
    changed_by: int
    reason: str | None
    created_at: datetime


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[ServiceOut])
async def list_services(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    await _ensure_seeded(db)
    result = await db.execute(select(Service).where(Service.is_active == True).order_by(Service.id))
    return result.scalars().all()


@router.post("/", response_model=ServiceOut, status_code=201)
async def create_service(
    body: ServiceCreate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(*MANAGE_ROLES)),
):
    existing = await db.execute(select(Service).where(Service.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Услуга с таким названием уже существует")
    svc = Service(name=body.name, description=body.description, is_active=True)
    db.add(svc)
    await db.commit()
    await db.refresh(svc)
    return svc


@router.get("/permissions/{user_id}", response_model=list[PermissionOut])
async def get_user_permissions(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    await _ensure_seeded(db)
    services = (await db.execute(
        select(Service).where(Service.is_active == True).order_by(Service.id)
    )).scalars().all()

    perms_result = await db.execute(
        select(UserServicePermission).where(UserServicePermission.user_id == user_id)
    )
    perms_map = {p.service_id: p for p in perms_result.scalars().all()}

    out = []
    for svc in services:
        perm = perms_map.get(svc.id)
        out.append(PermissionOut(
            service_id=svc.id,
            service_name=svc.name,
            status=perm.status if perm else PermissionStatus.not_permitted,
        ))
    return out


@router.post("/permissions", response_model=PermissionOut, status_code=201)
async def grant_permission(
    body: GrantBody,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(*MANAGE_ROLES)),
):
    svc = await db.get(Service, body.service_id)
    if not svc or not svc.is_active:
        raise HTTPException(status_code=404, detail="Услуга не найдена")

    result = await db.execute(
        select(UserServicePermission).where(
            UserServicePermission.user_id == body.user_id,
            UserServicePermission.service_id == body.service_id,
        )
    )
    perm = result.scalar_one_or_none()
    old_status = perm.status if perm else None

    now = datetime.now(timezone.utc)
    if perm is None:
        perm = UserServicePermission(
            user_id=body.user_id,
            service_id=body.service_id,
            status=PermissionStatus.permitted,
            granted_by=actor.id,
            granted_at=now,
        )
        db.add(perm)
        await db.flush()
    else:
        if perm.status == PermissionStatus.permitted:
            return PermissionOut(service_id=svc.id, service_name=svc.name, status=perm.status)
        perm.status = PermissionStatus.permitted
        perm.granted_by = actor.id
        perm.granted_at = now
        perm.revoked_by = None
        perm.revoked_at = None

    db.add(ServicePermissionHistory(
        permission_id=perm.id,
        changed_by=actor.id,
        old_status=old_status,
        new_status=PermissionStatus.permitted,
    ))
    await db.commit()
    return PermissionOut(service_id=svc.id, service_name=svc.name, status=PermissionStatus.permitted)


@router.delete("/permissions/{user_id}/{service_id}", status_code=204)
async def revoke_permission(
    user_id: int,
    service_id: int,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(*MANAGE_ROLES)),
):
    result = await db.execute(
        select(UserServicePermission).where(
            UserServicePermission.user_id == user_id,
            UserServicePermission.service_id == service_id,
        )
    )
    perm = result.scalar_one_or_none()
    if perm is None or perm.status == PermissionStatus.not_permitted:
        raise HTTPException(status_code=404, detail="Допуск не найден или уже отозван")

    old_status = perm.status
    perm.status = PermissionStatus.not_permitted
    perm.revoked_by = actor.id
    perm.revoked_at = datetime.now(timezone.utc)

    db.add(ServicePermissionHistory(
        permission_id=perm.id,
        changed_by=actor.id,
        old_status=old_status,
        new_status=PermissionStatus.not_permitted,
    ))
    await db.commit()


@router.get("/permissions/{user_id}/history", response_model=list[HistoryOut])
async def get_permission_history(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(*MANAGE_ROLES)),
):
    # Load permissions for this user
    perms_result = await db.execute(
        select(UserServicePermission).where(UserServicePermission.user_id == user_id)
    )
    perms = perms_result.scalars().all()
    if not perms:
        return []

    perm_ids = [p.id for p in perms]
    service_map = {p.id: p.service_id for p in perms}

    # Load services for name lookup
    svc_result = await db.execute(select(Service))
    svc_map = {s.id: s.name for s in svc_result.scalars().all()}

    history_result = await db.execute(
        select(ServicePermissionHistory)
        .where(ServicePermissionHistory.permission_id.in_(perm_ids))
        .order_by(ServicePermissionHistory.created_at.desc())
    )

    out = []
    for h in history_result.scalars().all():
        sid = service_map[h.permission_id]
        out.append(HistoryOut(
            id=h.id,
            service_id=sid,
            service_name=svc_map.get(sid, "—"),
            old_status=h.old_status,
            new_status=h.new_status,
            changed_by=h.changed_by,
            reason=h.reason,
            created_at=h.created_at,
        ))
    return out
