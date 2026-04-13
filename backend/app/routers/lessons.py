from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user, require_role
from app.models.lesson import Lesson, LessonProgress, LessonProgressStatus
from app.models.user import User, UserRole
from app.schemas.lesson import (
    LessonCreate,
    LessonOut,
    LessonProgressOut,
    LessonProgressUpdate,
    LessonUpdate,
)

router = APIRouter(prefix="/lessons", tags=["lessons"])


@router.get("/by-module/{module_id}", response_model=list[LessonOut])
async def list_lessons(
    module_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Lesson).where(Lesson.module_id == module_id).order_by(Lesson.order_index, Lesson.id)
    if current_user.role not in (UserRole.manager, UserRole.owner, UserRole.superadmin):
        query = query.where(Lesson.is_published.is_(True))
    result = await db.execute(query)
    return [LessonOut.model_validate(l) for l in result.scalars().all()]


@router.get("/{lesson_id}", response_model=LessonOut)
async def get_lesson(
    lesson_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Lesson).where(Lesson.id == lesson_id))
    lesson = result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
    return LessonOut.model_validate(lesson)


@router.post("/", response_model=LessonOut, status_code=status.HTTP_201_CREATED)
async def create_lesson(
    body: LessonCreate,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    lesson = Lesson(**body.model_dump())
    db.add(lesson)
    await db.commit()
    await db.refresh(lesson)
    return LessonOut.model_validate(lesson)


@router.patch("/{lesson_id}", response_model=LessonOut)
async def update_lesson(
    lesson_id: int,
    body: LessonUpdate,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Lesson).where(Lesson.id == lesson_id))
    lesson = result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(lesson, field, value)

    await db.commit()
    await db.refresh(lesson)
    return LessonOut.model_validate(lesson)


@router.delete("/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lesson(
    lesson_id: int,
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Lesson).where(Lesson.id == lesson_id))
    lesson = result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
    await db.delete(lesson)
    await db.commit()


# --- Progress ---

@router.get("/{lesson_id}/progress", response_model=LessonProgressOut | None)
async def get_progress(
    lesson_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LessonProgress).where(
            LessonProgress.user_id == current_user.id,
            LessonProgress.lesson_id == lesson_id,
        )
    )
    progress = result.scalar_one_or_none()
    if progress is None:
        return None
    return LessonProgressOut.model_validate(progress)


@router.put("/{lesson_id}/progress", response_model=LessonProgressOut)
async def update_progress(
    lesson_id: int,
    body: LessonProgressUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LessonProgress).where(
            LessonProgress.user_id == current_user.id,
            LessonProgress.lesson_id == lesson_id,
        )
    )
    progress = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if progress is None:
        progress = LessonProgress(
            user_id=current_user.id,
            lesson_id=lesson_id,
            status=body.status,
            started_at=now if body.status != LessonProgressStatus.not_started else None,
            completed_at=now if body.status == LessonProgressStatus.completed else None,
        )
        db.add(progress)
    else:
        progress.status = body.status
        if body.status == LessonProgressStatus.in_progress and progress.started_at is None:
            progress.started_at = now
        if body.status == LessonProgressStatus.completed:
            progress.completed_at = now

    await db.commit()
    await db.refresh(progress)
    return LessonProgressOut.model_validate(progress)
