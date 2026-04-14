from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user, require_role
from app.models.course import Course, Module
from app.models.lesson import Lesson
from app.models.test import Test, TestAnswer, TestQuestion
from app.models.user import User, UserRole
from app.schemas.course import (
    CourseCreate,
    CourseOut,
    CourseUpdate,
    ModuleCreate,
    ModuleOut,
    ModuleUpdate,
)
from app.schemas.lesson import LessonOut

router = APIRouter(prefix="/courses", tags=["courses"])


class ModuleWithLessons(ModuleOut):
    lessons: list[LessonOut] = []


class CourseDetailOut(CourseOut):
    modules: list[ModuleWithLessons] = []


@router.get("/", response_model=list[CourseOut])
async def list_courses(
    is_published: bool | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Course).order_by(Course.order_index, Course.id)
    if current_user.role not in (UserRole.manager, UserRole.owner, UserRole.superadmin):
        query = query.where(
            Course.is_published.is_(True),
            Course.target_roles.any(current_user.role.value),
        )
    elif is_published is not None:
        query = query.where(Course.is_published == is_published)
    result = await db.execute(query)
    return [CourseOut.model_validate(c) for c in result.scalars().all()]


@router.get("/{course_id}", response_model=CourseDetailOut)
async def get_course(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    modules_result = await db.execute(
        select(Module).where(Module.course_id == course_id).order_by(Module.order_index, Module.id)
    )
    modules = modules_result.scalars().all()

    modules_out = []
    for m in modules:
        lessons_result = await db.execute(
            select(Lesson).where(Lesson.module_id == m.id).order_by(Lesson.order_index, Lesson.id)
        )
        lessons = [LessonOut.model_validate(l) for l in lessons_result.scalars().all()]
        mod = ModuleWithLessons(**ModuleOut.model_validate(m).model_dump(), lessons=lessons)
        modules_out.append(mod)

    return CourseDetailOut(**CourseOut.model_validate(course).model_dump(), modules=modules_out)


@router.post("/", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
async def create_course(
    body: CourseCreate,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    course = Course(**body.model_dump(), created_by=current_user.id)
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return CourseOut.model_validate(course)


@router.patch("/{course_id}", response_model=CourseOut)
async def update_course(
    course_id: int,
    body: CourseUpdate,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(course, field, value)

    await db.commit()
    await db.refresh(course)
    return CourseOut.model_validate(course)


@router.post("/{course_id}/publish", response_model=CourseOut)
async def publish_course(
    course_id: int,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    course.is_published = True
    await db.commit()
    await db.refresh(course)
    return CourseOut.model_validate(course)


@router.post("/{course_id}/unpublish", response_model=CourseOut)
async def unpublish_course(
    course_id: int,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    course.is_published = False
    await db.commit()
    await db.refresh(course)
    return CourseOut.model_validate(course)


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(
    course_id: int,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    await db.delete(course)
    await db.commit()


# --- Import ---

class AnswerImport(BaseModel):
    answer_text: str
    is_correct: bool = False


class QuestionImport(BaseModel):
    question_text: str
    order_index: int = 0
    answers: list[AnswerImport] = []


class TestImport(BaseModel):
    pass_threshold: int = 95
    questions: list[QuestionImport] = []


class LessonImport(BaseModel):
    title: str
    content_text: str | None = None
    video_url: str | None = None
    order_index: int = 0
    test: TestImport | None = None


class ModuleImport(BaseModel):
    title: str
    order_index: int = 0
    lessons: list[LessonImport] = []


class CourseImport(BaseModel):
    title: str
    description: str | None = None
    target_roles: list[str] = []
    modules: list[ModuleImport] = []


@router.post("/import", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
async def import_course(
    body: CourseImport,
    current_user: User = Depends(require_role(UserRole.superadmin)),
    db: AsyncSession = Depends(get_db),
):
    course = Course(
        title=body.title,
        description=body.description,
        target_roles=body.target_roles,
        created_by=current_user.id,
    )
    db.add(course)
    await db.flush()

    for mod_data in body.modules:
        module = Module(
            course_id=course.id,
            title=mod_data.title,
            order_index=mod_data.order_index,
        )
        db.add(module)
        await db.flush()

        for les_data in mod_data.lessons:
            lesson = Lesson(
                module_id=module.id,
                title=les_data.title,
                content_text=les_data.content_text,
                video_url=les_data.video_url,
                order_index=les_data.order_index,
            )
            db.add(lesson)
            await db.flush()

            if les_data.test and les_data.test.questions:
                test = Test(lesson_id=lesson.id, pass_threshold=les_data.test.pass_threshold)
                db.add(test)
                await db.flush()
                for q_data in les_data.test.questions:
                    q = TestQuestion(test_id=test.id, question_text=q_data.question_text, order_index=q_data.order_index)
                    db.add(q)
                    await db.flush()
                    for a_data in q_data.answers:
                        db.add(TestAnswer(question_id=q.id, answer_text=a_data.answer_text, is_correct=a_data.is_correct))

    await db.commit()
    await db.refresh(course)
    return CourseOut.model_validate(course)


# --- Modules ---

@router.get("/{course_id}/modules", response_model=list[ModuleOut])
async def list_modules(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Module).where(Module.course_id == course_id).order_by(Module.order_index, Module.id)
    )
    return [ModuleOut.model_validate(m) for m in result.scalars().all()]


@router.post("/modules/", response_model=ModuleOut, status_code=status.HTTP_201_CREATED)
async def create_module(
    body: ModuleCreate,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    module = Module(course_id=body.course_id, title=body.title, order_index=body.order_index)
    db.add(module)
    await db.commit()
    await db.refresh(module)
    return ModuleOut.model_validate(module)


@router.patch("/modules/{module_id}", response_model=ModuleOut)
async def update_module(
    module_id: int,
    body: ModuleUpdate,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Module).where(Module.id == module_id))
    module = result.scalar_one_or_none()
    if module is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(module, field, value)

    await db.commit()
    await db.refresh(module)
    return ModuleOut.model_validate(module)


@router.delete("/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_module(
    module_id: int,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Module).where(Module.id == module_id))
    module = result.scalar_one_or_none()
    if module is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")
    await db.delete(module)
    await db.commit()
