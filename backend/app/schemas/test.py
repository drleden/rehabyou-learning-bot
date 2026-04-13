from datetime import datetime

from pydantic import BaseModel


class TestOut(BaseModel):
    id: int
    lesson_id: int
    pass_threshold: int
    created_at: datetime

    model_config = {"from_attributes": True}


class TestCreate(BaseModel):
    lesson_id: int
    pass_threshold: int = 95


class TestUpdate(BaseModel):
    pass_threshold: int | None = None


class TestQuestionOut(BaseModel):
    id: int
    test_id: int
    question_text: str
    order_index: int

    model_config = {"from_attributes": True}


class TestQuestionCreate(BaseModel):
    test_id: int
    question_text: str
    order_index: int = 0


class TestAnswerOut(BaseModel):
    id: int
    question_id: int
    answer_text: str
    is_correct: bool

    model_config = {"from_attributes": True}


class TestAnswerCreate(BaseModel):
    question_id: int
    answer_text: str
    is_correct: bool = False


class TestAttemptOut(BaseModel):
    id: int
    user_id: int
    test_id: int
    score: int
    passed: bool
    answers_snapshot: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TestSubmit(BaseModel):
    answers: dict  # {question_id: answer_id}
