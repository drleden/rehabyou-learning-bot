from datetime import datetime

from pydantic import BaseModel

from app.models.assignment import AssignmentStatus


class AssignmentOut(BaseModel):
    id: int
    lesson_id: int
    user_id: int
    text: str
    status: AssignmentStatus
    reviewer_id: int | None = None
    reviewer_comment: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AssignmentCreate(BaseModel):
    lesson_id: int
    text: str


class AssignmentReview(BaseModel):
    status: AssignmentStatus
    reviewer_comment: str | None = None
