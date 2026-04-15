from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user, require_role
from app.models.user import User, UserRole
from app.schemas.user import UserOut
from app.utils.auth import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def _split_name(full_name: str) -> tuple[str, str]:
    parts = full_name.strip().split(None, 1)
    return (parts[0] if parts else "", parts[1] if len(parts) > 1 else "")


class PhoneLoginRequest(BaseModel):
    phone: str
    password: str


class PhoneRegisterRequest(BaseModel):
    phone: str
    password: str
    first_name: str = ""
    last_name: str = ""
    full_name: str | None = None  # backward compat


class TelegramAuthRequest(BaseModel):
    telegram_id: int
    telegram_username: str | None = None
    first_name: str = ""
    last_name: str = ""
    full_name: str | None = None


class InitRequest(BaseModel):
    password: str
    first_name: str = ""
    last_name: str = ""
    full_name: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


@router.post("/phone-login", response_model=TokenResponse)
async def phone_login(body: PhoneLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.phone == body.phone))
    user = result.scalar_one_or_none()

    if user is None or user.password_hash is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if user.is_blocked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is blocked")

    user.last_seen_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)

    return TokenResponse(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.post("/phone-register", response_model=TokenResponse)
async def phone_register(body: PhoneRegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.phone == body.phone))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phone already registered")

    fn, ln = body.first_name, body.last_name
    if not fn and not ln and body.full_name:
        fn, ln = _split_name(body.full_name)

    user = User(
        phone=body.phone,
        first_name=fn,
        last_name=ln,
        password_hash=hash_password(body.password),
        role=UserRole.novice,
        last_seen_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return TokenResponse(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.post("/telegram", response_model=TokenResponse)
async def telegram_auth(body: TelegramAuthRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.telegram_id == body.telegram_id))
    user = result.scalar_one_or_none()

    fn, ln = body.first_name, body.last_name
    if not fn and not ln and body.full_name:
        fn, ln = _split_name(body.full_name)

    if user is None:
        user = User(
            telegram_id=body.telegram_id,
            telegram_username=body.telegram_username,
            first_name=fn,
            last_name=ln,
            role=UserRole.novice,
            last_seen_at=datetime.now(timezone.utc),
        )
        db.add(user)
    else:
        if user.is_blocked:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is blocked")
        user.telegram_username = body.telegram_username
        user.last_seen_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(user)

    return TokenResponse(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.post("/init", response_model=TokenResponse)
async def init_superadmin(body: InitRequest, db: AsyncSession = Depends(get_db)):
    count_result = await db.execute(select(func.count()).select_from(User))
    count = count_result.scalar()
    if count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Init is only available when users table is empty",
        )

    fn, ln = body.first_name, body.last_name
    if not fn and not ln:
        if body.full_name:
            fn, ln = _split_name(body.full_name)
        else:
            fn = "Суперадмин"

    user = User(
        phone="+79852977062",
        first_name=fn,
        last_name=ln,
        password_hash=hash_password(body.password),
        role=UserRole.superadmin,
        last_seen_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return TokenResponse(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


# --- Telegram link ---

class TelegramLinkRequest(BaseModel):
    telegram_id: int
    telegram_username: str | None = None


class TelegramLinkByIdRequest(BaseModel):
    user_id: int
    telegram_id: int
    telegram_username: str | None = None


@router.post("/telegram/link", response_model=UserOut)
async def link_telegram(
    body: TelegramLinkRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check if this telegram_id is already linked to another user
    existing = await db.execute(
        select(User).where(User.telegram_id == body.telegram_id, User.id != current_user.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Telegram already linked to another user")
    current_user.telegram_id = body.telegram_id
    current_user.telegram_username = body.telegram_username
    await db.commit()
    await db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.post("/telegram/link-by-id", response_model=UserOut)
async def link_telegram_by_id(
    body: TelegramLinkByIdRequest,
    current_user: User = Depends(require_role(UserRole.superadmin)),
    db: AsyncSession = Depends(get_db),
):
    # Unlink any other user with this telegram_id first
    await db.execute(
        select(User).where(User.telegram_id == body.telegram_id, User.id != body.user_id)
    )
    existing = (await db.execute(
        select(User).where(User.telegram_id == body.telegram_id, User.id != body.user_id)
    )).scalar_one_or_none()
    if existing:
        existing.telegram_id = None
        existing.telegram_username = None

    target = (await db.execute(select(User).where(User.id == body.user_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    target.telegram_id = body.telegram_id
    target.telegram_username = body.telegram_username
    await db.commit()
    await db.refresh(target)
    return UserOut.model_validate(target)


@router.delete("/telegram/link", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_telegram(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.telegram_id = None
    current_user.telegram_username = None
    await db.commit()
