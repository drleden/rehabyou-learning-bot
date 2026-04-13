from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user, require_role
from app.models.assignment import AssignmentStatus, PracticalAssignment
from app.models.user import User, UserRole
from app.schemas.assignment import AssignmentCreate, AssignmentOut, AssignmentReview

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.get("/my", response_model=list[AssignmentOut])
async def my_assignments(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PracticalAssignment)
        .where(PracticalAssignment.user_id == current_user.id)
        .order_by(PracticalAssignment.created_at.desc())
    )
    return [AssignmentOut.model_validate(a) for a in result.scalars().all()]


@router.post("/", response_model=AssignmentOut, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    body: AssignmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    assignment = PracticalAssignment(
        lesson_id=body.lesson_id,
        user_id=current_user.id,
        text=body.text,
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return AssignmentOut.model_validate(assignment)


@router.get("/pending", response_model=list[AssignmentOut])
async def pending_assignments(
    limit: int = Query(50, le=200),
    current_user: User = Depends(require_role(UserRole.teacher)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PracticalAssignment)
        .where(PracticalAssignment.status == AssignmentStatus.pending)
        .order_by(PracticalAssignment.created_at)
        .limit(limit)
    )
    return [AssignmentOut.model_validate(a) for a in result.scalars().all()]


@router.patch("/{assignment_id}/review", response_model=AssignmentOut)
async def review_assignment(
    assignment_id: int,
    body: AssignmentReview,
    current_user: User = Depends(require_role(UserRole.teacher)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PracticalAssignment).where(PracticalAssignment.id == assignment_id)
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    assignment.status = body.status
    assignment.reviewer_id = current_user.id
    assignment.reviewer_comment = body.reviewer_comment
    assignment.reviewed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(assignment)
    return AssignmentOut.model_validate(assignment)
