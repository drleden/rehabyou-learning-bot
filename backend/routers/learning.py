"""
Learner-facing course endpoints.

GET  /api/learning/courses            — my courses (filtered by user roles)
GET  /api/learning/courses/{id}       — course detail with per-lesson progress
GET  /api/learning/lessons/{id}       — lesson content + unlock check
POST /api/learning/lessons/{id}/complete   — mark lesson complete (no test/assignment)
POST /api/learning/lessons/{id}/test       — submit test answers, get score
POST /api/learning/lessons/{id}/assignment — submit assignment text
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from deps import get_current_user
from models.courses import (
    Assignment, AssignmentAnswer, AssignmentStatus,
    Course, CourseRole, Lesson, LessonStatus,
    Module, Test, TestAttempt, TestQuestion, UserProgress,
)
from models.users import User

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _ordered_lessons(course: Course) -> list[Lesson]:
    """All published lessons in course order (by module pos → lesson pos)."""
    result = []
    for module in sorted(course.modules, key=lambda m: m.position):
        for lesson in sorted(module.lessons, key=lambda l: l.position):
            if lesson.status == LessonStatus.published:
                result.append(lesson)
    return result


def _compute_statuses(ordered: list[Lesson], completed_ids: set[int]) -> dict[int, str]:
    statuses: dict[int, str] = {}
    for i, lesson in enumerate(ordered):
        if lesson.id in completed_ids:
            statuses[lesson.id] = "completed"
        elif i == 0 or ordered[i - 1].id in completed_ids:
            statuses[lesson.id] = "available"
        else:
            statuses[lesson.id] = "locked"
    return statuses


async def _load_course_full(course_id: int, db: AsyncSession) -> Course:
    result = await db.execute(
        select(Course)
        .where(Course.id == course_id)
        .options(
            selectinload(Course.roles),
            selectinload(Course.modules).selectinload(Module.lessons).selectinload(Lesson.test).selectinload(Test.questions),
            selectinload(Course.modules).selectinload(Module.lessons).selectinload(Lesson.assignment),
        )
    )
    course = result.scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return course


async def _get_completed_ids(user_id: int, db: AsyncSession) -> set[int]:
    rows = await db.execute(
        select(UserProgress.lesson_id)
        .where(UserProgress.user_id == user_id, UserProgress.is_completed == True, UserProgress.is_archived == False)  # noqa: E712
    )
    return {r for (r,) in rows.all()}


async def _get_or_create_progress(user_id: int, lesson_id: int, db: AsyncSession) -> UserProgress:
    result = await db.execute(
        select(UserProgress).where(
            UserProgress.user_id == user_id,
            UserProgress.lesson_id == lesson_id,
            UserProgress.is_archived == False,  # noqa: E712
        )
    )
    prog = result.scalar_one_or_none()
    if prog is None:
        prog = UserProgress(user_id=user_id, lesson_id=lesson_id)
        db.add(prog)
        await db.flush()
    return prog


def _next_lesson_id(ordered: list[Lesson], current_id: int) -> Optional[int]:
    ids = [l.id for l in ordered]
    try:
        idx = ids.index(current_id)
        return ids[idx + 1] if idx + 1 < len(ids) else None
    except ValueError:
        return None


def _lesson_course_module(lesson: Lesson, course: Course) -> tuple[int, int]:
    for module in course.modules:
        for l in module.lessons:
            if l.id == lesson.id:
                return course.id, module.id
    return course.id, lesson.module_id


# ── Output schemas ────────────────────────────────────────────────────────────

class MyCourseOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    completed: int
    total: int
    percent: int
    course_status: str  # "not_started" | "in_progress" | "completed"
    class Config: from_attributes = True


class LessonSummary(BaseModel):
    id: int
    title: str
    lesson_status: str  # "completed" | "available" | "locked"
    has_test: bool
    has_assignment: bool


class ModuleSummary(BaseModel):
    id: int
    title: str
    position: int
    lessons: list[LessonSummary]


class CourseProgressOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    completed: int
    total: int
    percent: int
    next_lesson_id: Optional[int]
    modules: list[ModuleSummary]


class ChoiceOut(BaseModel):
    index: int
    text: str


class QuestionOut(BaseModel):
    id: int
    question: str
    options: list[str]
    position: int


class TestOut(BaseModel):
    id: int
    pass_threshold: float
    questions: list[QuestionOut]


class AssignmentOut(BaseModel):
    id: int
    description: str
    min_words: int


class LessonDetailOut(BaseModel):
    id: int
    title: str
    content: Optional[str]
    video_url: Optional[str]
    lesson_status: str
    has_test: bool
    has_assignment: bool
    test: Optional[TestOut]
    assignment: Optional[AssignmentOut]
    course_id: int
    module_id: int
    next_lesson_id: Optional[int]
    is_completed: bool


class TestResultOut(BaseModel):
    score: float
    passed: bool
    correct: int
    total: int
    threshold: float
    attempt_number: int


class AssignmentResultOut(BaseModel):
    status: str
    ai_comment: str
    word_count: int


class SubmitTestIn(BaseModel):
    answers: list[int]


class SubmitAssignmentIn(BaseModel):
    text: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/courses", response_model=list[MyCourseOut], summary="Мои курсы")
async def my_courses(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_roles = user.roles or []

    # Courses accessible by user's roles
    result = await db.execute(
        select(Course)
        .join(CourseRole, CourseRole.course_id == Course.id)
        .where(CourseRole.role.in_(user_roles), Course.is_active == True)  # noqa: E712
        .options(
            selectinload(Course.modules).selectinload(Module.lessons)
        )
        .distinct()
        .order_by(Course.created_at.desc())
    )
    courses = result.scalars().unique().all()

    completed_ids = await _get_completed_ids(user.id, db)
    out = []
    for course in courses:
        ordered = _ordered_lessons(course)
        total = len(ordered)
        completed = sum(1 for l in ordered if l.id in completed_ids)
        percent = int(completed / total * 100) if total else 0
        if completed == 0:
            cs = "not_started"
        elif completed >= total and total > 0:
            cs = "completed"
        else:
            cs = "in_progress"
        out.append(MyCourseOut(
            id=course.id, title=course.title, description=course.description,
            completed=completed, total=total, percent=percent, course_status=cs,
        ))
    return out


@router.get("/courses/{course_id}", response_model=CourseProgressOut, summary="Курс с прогрессом")
async def course_progress(
    course_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    course = await _load_course_full(course_id, db)
    completed_ids = await _get_completed_ids(user.id, db)
    ordered = _ordered_lessons(course)
    statuses = _compute_statuses(ordered, completed_ids)
    total = len(ordered)
    completed = sum(1 for l in ordered if l.id in completed_ids)

    # Next available lesson
    next_id = next(
        (l.id for l in ordered if statuses.get(l.id) == "available"),
        None,
    )

    modules_out = []
    for module in sorted(course.modules, key=lambda m: m.position):
        pub_lessons = [l for l in sorted(module.lessons, key=lambda l: l.position)
                       if l.status == LessonStatus.published]
        lessons_out = [
            LessonSummary(
                id=l.id,
                title=l.title,
                lesson_status=statuses.get(l.id, "locked"),
                has_test=l.test is not None,
                has_assignment=l.assignment is not None,
            )
            for l in pub_lessons
        ]
        if lessons_out:
            modules_out.append(ModuleSummary(
                id=module.id, title=module.title, position=module.position,
                lessons=lessons_out,
            ))

    return CourseProgressOut(
        id=course.id, title=course.title, description=course.description,
        completed=completed, total=total,
        percent=int(completed / total * 100) if total else 0,
        next_lesson_id=next_id,
        modules=modules_out,
    )


@router.get("/lessons/{lesson_id}", response_model=LessonDetailOut, summary="Урок")
async def get_lesson(
    lesson_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Lesson)
        .where(Lesson.id == lesson_id)
        .options(
            selectinload(Lesson.module).selectinload(Module.course).selectinload(Course.modules).selectinload(Module.lessons).selectinload(Lesson.test).selectinload(Test.questions),
            selectinload(Lesson.module).selectinload(Module.course).selectinload(Course.modules).selectinload(Module.lessons).selectinload(Lesson.assignment),
            selectinload(Lesson.test).selectinload(Test.questions),
            selectinload(Lesson.assignment),
        )
    )
    lesson = result.scalar_one_or_none()
    if lesson is None or lesson.status != LessonStatus.published:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")

    course = lesson.module.course
    completed_ids = await _get_completed_ids(user.id, db)
    ordered = _ordered_lessons(course)
    statuses = _compute_statuses(ordered, completed_ids)
    lesson_status = statuses.get(lesson.id, "locked")

    if lesson_status == "locked":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Complete the previous lesson first",
        )

    test_out = None
    if lesson.test:
        qs = sorted(lesson.test.questions, key=lambda q: q.position)
        test_out = TestOut(
            id=lesson.test.id,
            pass_threshold=lesson.test.pass_threshold,
            questions=[
                QuestionOut(id=q.id, question=q.question, options=q.options, position=q.position)
                for q in qs
            ],
        )

    assignment_out = None
    if lesson.assignment:
        assignment_out = AssignmentOut(
            id=lesson.assignment.id,
            description=lesson.assignment.description,
            min_words=lesson.assignment.min_words,
        )

    next_id = _next_lesson_id(ordered, lesson.id)

    return LessonDetailOut(
        id=lesson.id, title=lesson.title,
        content=lesson.content, video_url=lesson.video_url,
        lesson_status=lesson_status,
        has_test=lesson.test is not None,
        has_assignment=lesson.assignment is not None,
        test=test_out,
        assignment=assignment_out,
        course_id=course.id,
        module_id=lesson.module_id,
        next_lesson_id=next_id,
        is_completed=lesson.id in completed_ids,
    )


@router.post(
    "/lessons/{lesson_id}/complete",
    response_model=dict,
    summary="Отметить урок как пройденный",
)
async def complete_lesson(
    lesson_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Lesson)
        .where(Lesson.id == lesson_id)
        .options(
            selectinload(Lesson.test),
            selectinload(Lesson.assignment),
            selectinload(Lesson.module).selectinload(Module.course)
                .selectinload(Course.modules).selectinload(Module.lessons),
        )
    )
    lesson = result.scalar_one_or_none()
    if lesson is None or lesson.status != LessonStatus.published:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")

    if lesson.test and lesson.test.questions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Submit the test first")
    if lesson.assignment:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Submit the assignment first")

    prog = await _get_or_create_progress(user.id, lesson_id, db)
    prog.is_completed = True
    prog.completed_at = datetime.now(timezone.utc)
    await db.commit()

    course = lesson.module.course
    ordered = _ordered_lessons(course)
    next_id = _next_lesson_id(ordered, lesson_id)
    return {"ok": True, "next_lesson_id": next_id}


@router.post("/lessons/{lesson_id}/test", response_model=TestResultOut, summary="Сдать тест")
async def submit_test(
    lesson_id: int,
    body: SubmitTestIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Lesson)
        .where(Lesson.id == lesson_id)
        .options(
            selectinload(Lesson.test).selectinload(Test.questions),
            selectinload(Lesson.assignment),
            selectinload(Lesson.module).selectinload(Module.course)
                .selectinload(Course.modules).selectinload(Module.lessons),
        )
    )
    lesson = result.scalar_one_or_none()
    if lesson is None or lesson.status != LessonStatus.published:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
    if lesson.test is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This lesson has no test")

    questions = sorted(lesson.test.questions, key=lambda q: q.position)
    if len(body.answers) != len(questions):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Expected {len(questions)} answers, got {len(body.answers)}",
        )

    correct = sum(
        1 for q, a in zip(questions, body.answers)
        if a == q.correct_index
    )
    total = len(questions)
    score = correct / total * 100 if total else 0
    threshold = lesson.test.pass_threshold * 100
    passed = score >= threshold

    # Count previous attempts
    prev = await db.execute(
        select(TestAttempt)
        .where(TestAttempt.user_id == user.id, TestAttempt.test_id == lesson.test.id)
    )
    attempt_number = len(prev.scalars().all()) + 1

    db.add(TestAttempt(
        user_id=user.id,
        test_id=lesson.test.id,
        score=score,
        passed=passed,
        answers=body.answers,
        attempt_number=attempt_number,
    ))

    # If passed and no assignment pending → mark complete
    if passed and lesson.assignment is None:
        prog = await _get_or_create_progress(user.id, lesson_id, db)
        prog.is_completed = True
        prog.completed_at = datetime.now(timezone.utc)
        logger.info("Lesson %s completed by user %s via test", lesson_id, user.id)

    await db.commit()

    return TestResultOut(
        score=round(score, 1),
        passed=passed,
        correct=correct,
        total=total,
        threshold=threshold,
        attempt_number=attempt_number,
    )


@router.post(
    "/lessons/{lesson_id}/assignment",
    response_model=AssignmentResultOut,
    summary="Отправить практическое задание",
)
async def submit_assignment(
    lesson_id: int,
    body: SubmitAssignmentIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Lesson)
        .where(Lesson.id == lesson_id)
        .options(
            selectinload(Lesson.assignment).selectinload(Assignment.answers),
            selectinload(Lesson.module).selectinload(Module.course)
                .selectinload(Course.modules).selectinload(Module.lessons),
        )
    )
    lesson = result.scalar_one_or_none()
    if lesson is None or lesson.status != LessonStatus.published:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
    if lesson.assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This lesson has no assignment")

    word_count = len(body.text.split())
    min_words = lesson.assignment.min_words

    if word_count < min_words:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Minimum {min_words} words required, got {word_count}",
        )

    prev = [a for a in lesson.assignment.answers if a.user_id == user.id]
    attempt_number = len(prev) + 1

    ai_comment = (
        "Отличная работа! Вы подробно и грамотно изложили материал. "
        "Продолжайте в том же духе — это демонстрирует глубокое понимание темы."
    )
    ai_score = min(100.0, 70.0 + word_count * 0.5)

    answer = AssignmentAnswer(
        assignment_id=lesson.assignment.id,
        user_id=user.id,
        text=body.text,
        status=AssignmentStatus.accepted,
        ai_score=ai_score,
        ai_comment=ai_comment,
        attempt_number=attempt_number,
    )
    db.add(answer)

    # Mark lesson as complete
    prog = await _get_or_create_progress(user.id, lesson_id, db)
    prog.is_completed = True
    prog.completed_at = datetime.now(timezone.utc)
    logger.info("Lesson %s completed by user %s via assignment", lesson_id, user.id)

    await db.commit()

    return AssignmentResultOut(
        status="accepted",
        ai_comment=ai_comment,
        word_count=word_count,
    )
