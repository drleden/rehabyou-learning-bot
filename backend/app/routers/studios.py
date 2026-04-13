from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_role
from app.models.studio import Studio, UserStudio
from app.models.user import User, UserRole
from app.schemas.studio import StudioCreate, StudioOut, StudioUpdate, UserStudioCreate, UserStudioOut

router = APIRouter(prefix="/studios", tags=["studios"])


@router.get("/", response_model=list[StudioOut])
async def list_studios(
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Studio).order_by(Studio.id))
    return [StudioOut.model_validate(s) for s in result.scalars().all()]


@router.post("/", response_model=StudioOut, status_code=status.HTTP_201_CREATED)
async def create_studio(
    body: StudioCreate,
    current_user: User = Depends(require_role(UserRole.owner)),
    db: AsyncSession = Depends(get_db),
):
    studio = Studio(name=body.name, city=body.city)
    db.add(studio)
    await db.commit()
    await db.refresh(studio)
    return StudioOut.model_validate(studio)


@router.patch("/{studio_id}", response_model=StudioOut)
async def update_studio(
    studio_id: int,
    body: StudioUpdate,
    current_user: User = Depends(require_role(UserRole.owner)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Studio).where(Studio.id == studio_id))
    studio = result.scalar_one_or_none()
    if studio is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Studio not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(studio, field, value)

    await db.commit()
    await db.refresh(studio)
    return StudioOut.model_validate(studio)


@router.post("/members", response_model=UserStudioOut, status_code=status.HTTP_201_CREATED)
async def add_member(
    body: UserStudioCreate,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    link = UserStudio(user_id=body.user_id, studio_id=body.studio_id)
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return UserStudioOut.model_validate(link)


@router.get("/{studio_id}/members", response_model=list[UserStudioOut])
async def list_members(
    studio_id: int,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserStudio).where(UserStudio.studio_id == studio_id, UserStudio.is_active.is_(True))
    )
    return [UserStudioOut.model_validate(m) for m in result.scalars().all()]
