from datetime import datetime

from pydantic import BaseModel, computed_field

from app.models.user import UserRole


class UserOut(BaseModel):
    id: int
    phone: str | None = None
    telegram_id: int | None = None
    telegram_username: str | None = None
    first_name: str = ""
    last_name: str = ""
    avatar_url: str | None = None
    role: UserRole
    is_active: bool
    is_blocked: bool
    last_seen_at: datetime | None = None
    created_at: datetime

    @computed_field
    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    phone: str | None = None
    telegram_id: int | None = None
    telegram_username: str | None = None
    first_name: str = ""
    last_name: str = ""
    full_name: str | None = None  # backward compat
    role: UserRole = UserRole.novice
    password: str | None = None


class UserUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None
    is_blocked: bool | None = None
    avatar_url: str | None = None
