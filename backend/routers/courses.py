"""
Online learning endpoints.

GET    /api/courses/              — list courses
POST   /api/courses/              — create course
GET    /api/courses/progress/me   — my progress summary
GET    /api/courses/{id}          — course detail with modules & lessons
POST   /api/courses/{id}/modules  — add module to course
POST   /api/courses/modules/{id}/lessons — add lesson to module
PATCH  /api/courses/modules/{id}/reorder — reorder lessons in module
GET    /api/courses/lessons/{id}  — lesson detail (with presigned video URL)
PATCH  /api/courses/lessons/{id}  — edit lesson
DELETE /api/courses/lessons/{id}  — archive progress + delete lesson
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from deps import get_current_user, require_roles
from models.courses import (
    Assignment, Course, CourseRole, Lesson, LessonStatus, LessonVersion,
    Module, Test, TestQuestion, UserProgress,
)
from models.users import User

logger = logging.getLogger(__name__)
router = APIRouter()

MANAGE = ("superadmin", "owner", "admin", "manager")


# ── Schemas ───────────────────────────────────────────────────────────────────

class LessonOut(BaseModel):
    id: int
    title: str
    content: Optional[str]
    video_url: Optional[str]
    position: int
    status: str
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    class Config: from_attributes = True

class ModuleOut(BaseModel):
    id: int
    course_id: int
    title: str
    description: Optional[str]
    position: int
    lessons: list[LessonOut] = []
    class Config: from_attributes = True

class CourseOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    is_active: bool
    roles: list[str] = []
    module_count: int = 0
    created_at: Optional[datetime]
    class Config: from_attributes = True

class CourseDetail(CourseOut):
    modules: list[ModuleOut] = []

class CreateCourseIn(BaseModel):
    title: str
    description: Optional[str] = None
    roles: list[str] = []

class CreateModuleIn(BaseModel):
    title: str
    description: Optional[str] = None

class CreateLessonIn(BaseModel):
    title: str
    content: Optional[str] = None
    video_url: Optional[str] = None
    position: Optional[int] = None

class UpdateLessonIn(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    video_url: Optional[str] = None
    position: Optional[int] = None
    status: Optional[str] = None

class ReorderIn(BaseModel):
    lesson_ids: list[int]  # ordered list of lesson IDs for this module


# ── Import schemas ────────────────────────────────────────────────────────────

class ImportQuestionIn(BaseModel):
    text: str
    options: list[str]
    correct_index: int

class ImportTestIn(BaseModel):
    questions: list[ImportQuestionIn] = []

class ImportLessonIn(BaseModel):
    title: str
    content: Optional[str] = None
    test: Optional[ImportTestIn] = None

class ImportModuleIn(BaseModel):
    title: str
    lessons: list[ImportLessonIn] = []

class ImportCourseIn(BaseModel):
    title: str
    description: Optional[str] = None
    roles: list[str] = []
    modules: list[ImportModuleIn] = []


# ── Helpers ───────────────────────────────────────────────────────────────────

def _lesson_out(l: Lesson) -> LessonOut:
    return LessonOut(
        id=l.id, title=l.title, content=l.content, video_url=l.video_url,
        position=l.position, status=l.status.value,
        created_at=l.created_at, updated_at=l.updated_at,
    )

def _module_out(m: Module) -> ModuleOut:
    return ModuleOut(
        id=m.id, course_id=m.course_id, title=m.title, description=m.description,
        position=m.position,
        lessons=[_lesson_out(l) for l in (m.lessons or [])],
    )

def _course_out(c: Course) -> CourseOut:
    return CourseOut(
        id=c.id, title=c.title, description=c.description,
        is_active=c.is_active,
        roles=[r.role for r in (c.roles or [])],
        module_count=len(c.modules or []),
        created_at=c.created_at,
    )

def _course_detail(c: Course) -> CourseDetail:
    return CourseDetail(
        id=c.id, title=c.title, description=c.description,
        is_active=c.is_active,
        roles=[r.role for r in (c.roles or [])],
        module_count=len(c.modules or []),
        created_at=c.created_at,
        modules=[_module_out(m) for m in (c.modules or [])],
    )

async def _get_course(course_id: int, db: AsyncSession, *, full: bool = False) -> Course:
    opts = [selectinload(Course.roles)]
    if full:
        opts.append(
            selectinload(Course.modules).selectinload(Module.lessons)
        )
    result = await db.execute(select(Course).where(Course.id == course_id).options(*opts))
    course = result.scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return course

async def _get_module(module_id: int, db: AsyncSession) -> Module:
    result = await db.execute(
        select(Module).where(Module.id == module_id).options(selectinload(Module.lessons))
    )
    m = result.scalar_one_or_none()
    if m is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")
    return m

async def _get_lesson(lesson_id: int, db: AsyncSession) -> Lesson:
    result = await db.execute(select(Lesson).where(Lesson.id == lesson_id))
    l = result.scalar_one_or_none()
    if l is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
    return l


# ── Courses ───────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[CourseOut], summary="Список курсов")
async def list_courses(
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(Course).options(
        selectinload(Course.roles),
        selectinload(Course.modules),
    )
    if is_active is not None:
        q = q.where(Course.is_active == is_active)
    q = q.order_by(Course.created_at.desc())
    result = await db.execute(q)
    return [_course_out(c) for c in result.scalars().unique().all()]


@router.post(
    "/", response_model=CourseDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Создать курс",
)
async def create_course(
    body: CreateCourseIn,
    caller: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    course = Course(
        title=body.title,
        description=body.description,
        is_active=True,
        created_by=caller.id,
    )
    db.add(course)
    await db.flush()  # get course.id

    for role in body.roles:
        db.add(CourseRole(course_id=course.id, role=role))

    await db.commit()
    return _course_detail(await _get_course(course.id, db, full=True))


@router.get("/progress/me", summary="Мой прогресс по курсам")
async def my_progress(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserProgress).where(
            UserProgress.user_id == user.id,
            UserProgress.is_archived == False,  # noqa: E712
        )
    )
    rows = result.scalars().all()
    completed = sum(1 for r in rows if r.is_completed)
    return {
        "course_title": "Базовый курс мастера",
        "module_title": "Загрузка…",
        "completed": completed,
        "total": len(rows) or 1,
        "percent": int(completed / len(rows) * 100) if rows else 0,
        "next_lesson_title": None,
    }


@router.post(
    "/import",
    status_code=status.HTTP_201_CREATED,
    summary="Импортировать курс из JSON",
)
async def import_course(
    body: ImportCourseIn,
    caller: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    course = Course(
        title=body.title,
        description=body.description,
        is_active=True,
        created_by=caller.id,
    )
    db.add(course)
    await db.flush()

    for role in body.roles:
        db.add(CourseRole(course_id=course.id, role=role))

    lesson_count = 0
    test_count = 0

    for mod_pos, mod_data in enumerate(body.modules):
        module = Module(
            course_id=course.id,
            title=mod_data.title,
            position=mod_pos,
        )
        db.add(module)
        await db.flush()

        for les_pos, les_data in enumerate(mod_data.lessons):
            lesson = Lesson(
                module_id=module.id,
                title=les_data.title,
                content=les_data.content,
                position=les_pos,
                status=LessonStatus.published,
                created_by=caller.id,
            )
            db.add(lesson)
            await db.flush()
            lesson_count += 1

            if les_data.test and les_data.test.questions:
                test = Test(lesson_id=lesson.id, pass_threshold=0.95)
                db.add(test)
                await db.flush()
                for q_pos, q in enumerate(les_data.test.questions):
                    db.add(TestQuestion(
                        test_id=test.id,
                        question=q.text,
                        options=q.options,
                        correct_index=q.correct_index,
                        position=q_pos,
                    ))
                test_count += 1

    await db.commit()
    logger.info(
        "Course imported: id=%s modules=%s lessons=%s tests=%s",
        course.id, len(body.modules), lesson_count, test_count,
    )
    return {
        "id": course.id,
        "title": course.title,
        "modules": len(body.modules),
        "lessons": lesson_count,
        "tests": test_count,
    }


@router.get("/{course_id}", response_model=CourseDetail, summary="Детали курса")
async def get_course(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return _course_detail(await _get_course(course_id, db, full=True))


# ── Modules ───────────────────────────────────────────────────────────────────

@router.post(
    "/{course_id}/modules",
    response_model=ModuleOut,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить модуль в курс",
)
async def create_module(
    course_id: int,
    body: CreateModuleIn,
    _: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    await _get_course(course_id, db)  # 404 if missing

    # next position
    res = await db.execute(select(Module).where(Module.course_id == course_id))
    position = len(res.scalars().all())

    module = Module(
        course_id=course_id,
        title=body.title,
        description=body.description,
        position=position,
    )
    db.add(module)
    await db.commit()
    # Re-fetch with selectinload so module.lessons is available (avoid MissingGreenlet)
    return _module_out(await _get_module(module.id, db))


@router.patch(
    "/modules/{module_id}/reorder",
    response_model=ModuleOut,
    summary="Изменить порядок уроков в модуле",
)
async def reorder_lessons(
    module_id: int,
    body: ReorderIn,
    _: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    module = await _get_module(module_id, db)
    lesson_ids = set(l.id for l in module.lessons)

    if set(body.lesson_ids) != lesson_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="lesson_ids must contain exactly the module's lessons",
        )

    for pos, lid in enumerate(body.lesson_ids):
        await db.execute(
            update(Lesson).where(Lesson.id == lid).values(position=pos)
        )
    await db.commit()
    return _module_out(await _get_module(module_id, db))


# ── Lessons ───────────────────────────────────────────────────────────────────

@router.post(
    "/modules/{module_id}/lessons",
    response_model=LessonOut,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить урок в модуль",
)
async def create_lesson(
    module_id: int,
    body: CreateLessonIn,
    caller: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    module = await _get_module(module_id, db)
    position = body.position if body.position is not None else len(module.lessons)

    lesson = Lesson(
        module_id=module_id,
        title=body.title,
        content=body.content,
        video_url=body.video_url,
        position=position,
        status=LessonStatus.draft,
        created_by=caller.id,
    )
    db.add(lesson)
    await db.commit()
    await db.refresh(lesson)
    logger.info("Lesson created: id=%s module=%s", lesson.id, module_id)
    return _lesson_out(lesson)


@router.get("/lessons/{lesson_id}", response_model=LessonOut, summary="Урок по ID")
async def get_lesson(
    lesson_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return _lesson_out(await _get_lesson(lesson_id, db))


@router.patch("/lessons/{lesson_id}", response_model=LessonOut, summary="Редактировать урок")
async def update_lesson(
    lesson_id: int,
    body: UpdateLessonIn,
    caller: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson(lesson_id, db)

    # Save version snapshot before edit
    db.add(LessonVersion(
        lesson_id=lesson.id,
        content=lesson.content,
        video_url=lesson.video_url,
        changed_by=caller.id,
    ))

    if body.title    is not None: lesson.title     = body.title
    if body.content  is not None: lesson.content   = body.content
    if body.video_url is not None: lesson.video_url = body.video_url
    if body.position is not None: lesson.position  = body.position
    if body.status   is not None:
        try:
            lesson.status = LessonStatus(body.status)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown status '{body.status}'. Use 'draft' or 'published'.",
            )

    await db.commit()
    await db.refresh(lesson)
    return _lesson_out(lesson)


@router.patch(
    "/lessons/{lesson_id}/publish",
    response_model=LessonOut,
    summary="Опубликовать / снять с публикации урок",
)
async def toggle_publish_lesson(
    lesson_id: int,
    _: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson(lesson_id, db)
    lesson.status = (
        LessonStatus.draft if lesson.status == LessonStatus.published
        else LessonStatus.published
    )
    await db.commit()
    await db.refresh(lesson)
    return _lesson_out(lesson)


@router.delete(
    "/lessons/{lesson_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить урок (архивировать прогресс)",
)
async def delete_lesson(
    lesson_id: int,
    _: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson(lesson_id, db)

    # Archive all user progress for this lesson (preserve history)
    await db.execute(
        update(UserProgress)
        .where(UserProgress.lesson_id == lesson_id)
        .values(is_archived=True)
    )

    await db.delete(lesson)
    await db.commit()
    logger.info("Lesson deleted (archived progress): lesson_id=%s", lesson_id)


# ── Test management (admin) ───────────────────────────────────────────────────

class CreateTestIn(BaseModel):
    pass_threshold: Optional[float] = 0.95

class CreateQuestionIn(BaseModel):
    question: str
    options: list[str]
    correct_index: int
    position: Optional[int] = None

class TestAdminOut(BaseModel):
    id: int
    lesson_id: int
    pass_threshold: float
    questions: list[dict]
    class Config: from_attributes = True


@router.post(
    "/lessons/{lesson_id}/test",
    status_code=status.HTTP_201_CREATED,
    summary="Создать тест для урока (или вернуть существующий)",
)
async def create_lesson_test(
    lesson_id: int,
    body: CreateTestIn,
    _: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson(lesson_id, db)

    result = await db.execute(
        select(Test).where(Test.lesson_id == lesson_id)
        .options(selectinload(Test.questions))
    )
    test = result.scalar_one_or_none()
    if test is None:
        test = Test(lesson_id=lesson_id, pass_threshold=body.pass_threshold)
        db.add(test)
        await db.commit()
        await db.refresh(test)

    return {"id": test.id, "lesson_id": test.lesson_id, "pass_threshold": test.pass_threshold, "questions": []}


@router.post(
    "/tests/{test_id}/questions",
    status_code=status.HTTP_201_CREATED,
    summary="Добавить вопрос к тесту",
)
async def add_test_question(
    test_id: int,
    body: CreateQuestionIn,
    _: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Test).where(Test.id == test_id).options(selectinload(Test.questions))
    )
    test = result.scalar_one_or_none()
    if test is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")

    position = body.position if body.position is not None else len(test.questions)
    q = TestQuestion(
        test_id=test_id,
        question=body.question,
        options=body.options,
        correct_index=body.correct_index,
        position=position,
    )
    db.add(q)
    await db.commit()
    await db.refresh(q)
    return {"id": q.id, "question": q.question, "options": q.options, "correct_index": q.correct_index, "position": q.position}


@router.delete(
    "/tests/questions/{question_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить вопрос теста",
)
async def delete_test_question(
    question_id: int,
    _: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TestQuestion).where(TestQuestion.id == question_id))
    q = result.scalar_one_or_none()
    if q is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    await db.delete(q)
    await db.commit()


# ── Assignment management (admin) ─────────────────────────────────────────────

class CreateAssignmentIn(BaseModel):
    description: str
    min_words: Optional[int] = 50


@router.post(
    "/lessons/{lesson_id}/assignment",
    status_code=status.HTTP_201_CREATED,
    summary="Создать задание для урока",
)
async def create_lesson_assignment(
    lesson_id: int,
    body: CreateAssignmentIn,
    _: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    await _get_lesson(lesson_id, db)

    result = await db.execute(select(Assignment).where(Assignment.lesson_id == lesson_id))
    existing = result.scalar_one_or_none()
    if existing:
        existing.description = body.description
        existing.min_words = body.min_words
        await db.commit()
        await db.refresh(existing)
        return {"id": existing.id, "lesson_id": lesson_id, "description": existing.description, "min_words": existing.min_words}

    assignment = Assignment(lesson_id=lesson_id, description=body.description, min_words=body.min_words)
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return {"id": assignment.id, "lesson_id": lesson_id, "description": assignment.description, "min_words": assignment.min_words}


@router.get(
    "/lessons/{lesson_id}/test",
    summary="Получить тест урока с вопросами",
)
async def get_lesson_test(
    lesson_id: int,
    _: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Test).where(Test.lesson_id == lesson_id)
        .options(selectinload(Test.questions))
    )
    test = result.scalar_one_or_none()
    if test is None:
        return None
    qs = sorted(test.questions, key=lambda q: q.position)
    return {
        "id": test.id,
        "lesson_id": test.lesson_id,
        "pass_threshold": test.pass_threshold,
        "questions": [
            {
                "id": q.id,
                "question": q.question,
                "options": q.options,
                "correct_index": q.correct_index,
                "position": q.position,
            }
            for q in qs
        ],
    }


@router.get(
    "/lessons/{lesson_id}/assignment",
    summary="Получить задание урока",
)
async def get_lesson_assignment(
    lesson_id: int,
    _: User = Depends(require_roles(*MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Assignment).where(Assignment.lesson_id == lesson_id))
    a = result.scalar_one_or_none()
    if a is None:
        return None
    return {"id": a.id, "lesson_id": lesson_id, "description": a.description, "min_words": a.min_words}
