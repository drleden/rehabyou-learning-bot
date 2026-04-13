from datetime import datetime

from pydantic import BaseModel


class StudioOut(BaseModel):
    id: int
    name: str
    city: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class StudioCreate(BaseModel):
    name: str
    city: str | None = None


class StudioUpdate(BaseModel):
    name: str | None = None
    city: str | None = None
    is_active: bool | None = None


class UserStudioOut(BaseModel):
    id: int
    user_id: int
    studio_id: int
    joined_at: datetime
    is_active: bool

    model_config = {"from_attributes": True}


class UserStudioCreate(BaseModel):
    user_id: int
    studio_id: int
