from datetime import datetime

from pydantic import BaseModel

from app.models.lesson import LessonProgressStatus


class LessonOut(BaseModel):
    id: int
    module_id: int
    title: str
    content_text: str | None = None
    video_url: str | None = None
    order_index: int
    is_published: bool
    created_at: datetime
    course_id: int | None = None
    module_title: str | None = None

    model_config = {"from_attributes": True}


class LessonCreate(BaseModel):
    module_id: int
    title: str
    content_text: str | None = None
    video_url: str | None = None
    order_index: int = 0
    is_published: bool = False


class LessonUpdate(BaseModel):
    title: str | None = None
    content_text: str | None = None
    video_url: str | None = None
    order_index: int | None = None
    is_published: bool | None = None


class LessonProgressOut(BaseModel):
    id: int
    user_id: int
    lesson_id: int
    status: LessonProgressStatus
    started_at: datetime | None = None
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class LessonProgressUpdate(BaseModel):
    status: LessonProgressStatus
