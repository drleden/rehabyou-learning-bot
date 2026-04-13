from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user, require_role
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.utils.auth import hash_password

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@router.get("/", response_model=list[UserOut])
async def list_users(
    role: UserRole | None = None,
    is_active: bool | None = None,
    search: str | None = None,
    studio_id: int | None = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    query = select(User).order_by(User.id)
    if role is not None:
        query = query.where(User.role == role)
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(User.full_name.ilike(pattern), User.phone.ilike(pattern))
        )
    if studio_id is not None:
        from app.models.studio import UserStudio
        query = query.join(UserStudio, User.id == UserStudio.user_id).where(
            UserStudio.studio_id == studio_id, UserStudio.is_active.is_(True)
        )
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    return [UserOut.model_validate(u) for u in result.scalars().all()]


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: int,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserOut.model_validate(user)


@router.post("/", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    user = User(
        phone=body.phone,
        telegram_id=body.telegram_id,
        telegram_username=body.telegram_username,
        full_name=body.full_name,
        role=body.role,
        password_hash=hash_password(body.password) if body.password else None,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    body: UserUpdate,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    current_user: User = Depends(require_role(UserRole.superadmin)),
    db: AsyncSession = Depends(get_db),
):
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete yourself"
        )
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    await db.delete(user)
    await db.commit()
