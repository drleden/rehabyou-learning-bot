from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user, require_role
from app.models.permission import ServicePermission, ServiceType
from app.models.user import User, UserRole
from app.utils.notify import notify_bot


SERVICE_LABELS = {
    "classic": "Классический массаж",
    "sport": "Спортивный массаж",
    "relax": "Расслабляющий массаж",
    "anticellulite": "Антицеллюлитный массаж",
    "face": "Массаж лица",
    "taping": "Тейпирование",
    "stones": "Массаж камнями",
}

router = APIRouter(prefix="/permissions", tags=["permissions"])


class PermissionOut(BaseModel):
    id: int
    user_id: int
    service: ServiceType
    granted_by: int | None = None
    granted_at: datetime
    revoked_by: int | None = None
    revoked_at: datetime | None = None
    is_active: bool

    model_config = {"from_attributes": True}


class PermissionGrant(BaseModel):
    user_id: int
    service: ServiceType


@router.get("/user/{user_id}", response_model=list[PermissionOut])
async def user_permissions(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ServicePermission)
        .where(ServicePermission.user_id == user_id, ServicePermission.is_active.is_(True))
    )
    return [PermissionOut.model_validate(p) for p in result.scalars().all()]


@router.post("/grant", response_model=PermissionOut, status_code=status.HTTP_201_CREATED)
async def grant_permission(
    body: PermissionGrant,
    current_user: User = Depends(require_role(UserRole.senior_master)),
    db: AsyncSession = Depends(get_db),
):
    perm = ServicePermission(
        user_id=body.user_id,
        service=body.service,
        granted_by=current_user.id,
    )
    db.add(perm)
    await db.commit()
    await db.refresh(perm)

    # Notify via telegram bot if user has telegram_id
    target = (await db.execute(select(User).where(User.id == body.user_id))).scalar_one_or_none()
    if target and target.telegram_id:
        await notify_bot({
            "type": "permission_granted",
            "telegram_id": target.telegram_id,
            "first_name": target.first_name,
            "service_name": SERVICE_LABELS.get(body.service.value, body.service.value),
        })

    return PermissionOut.model_validate(perm)


@router.delete("/revoke/{permission_id}", response_model=PermissionOut)
async def revoke_permission(
    permission_id: int,
    current_user: User = Depends(require_role(UserRole.senior_master)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ServicePermission).where(ServicePermission.id == permission_id)
    )
    perm = result.scalar_one_or_none()
    if perm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permission not found")

    perm.is_active = False
    perm.revoked_by = current_user.id
    perm.revoked_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(perm)
    return PermissionOut.model_validate(perm)
