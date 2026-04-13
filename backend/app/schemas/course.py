from datetime import datetime

from pydantic import BaseModel


class CourseOut(BaseModel):
    id: int
    title: str
    description: str | None = None
    cover_url: str | None = None
    target_roles: list[str] = []
    is_published: bool
    order_index: int
    created_by: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CourseCreate(BaseModel):
    title: str
    description: str | None = None
    cover_url: str | None = None
    target_roles: list[str] = []
    is_published: bool = False
    order_index: int = 0


class CourseUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    cover_url: str | None = None
    target_roles: list[str] | None = None
    is_published: bool | None = None
    order_index: int | None = None


class ModuleOut(BaseModel):
    id: int
    course_id: int
    title: str
    order_index: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ModuleCreate(BaseModel):
    course_id: int
    title: str
    order_index: int = 0


class ModuleUpdate(BaseModel):
    title: str | None = None
    order_index: int | None = None
