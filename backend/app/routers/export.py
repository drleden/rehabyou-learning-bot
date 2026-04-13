from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import case, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_role
from app.models.course import Course
from app.models.lesson import LessonProgress, LessonProgressStatus
from app.models.permission import ServicePermission, ServiceType
from app.models.studio import UserStudio
from app.models.test import Test, TestAttempt
from app.models.user import User, UserRole

router = APIRouter(prefix="/export", tags=["export"])


@router.get("/snapshot")
async def snapshot(
    current_user: User = Depends(require_role(UserRole.superadmin)),
    db: AsyncSession = Depends(get_db),
):
    # 1. Users by role
    role_result = await db.execute(
        select(User.role, func.count(User.id)).group_by(User.role)
    )
    users_by_role = {row[0].value: row[1] for row in role_result.all()}

    # 2. Users by studio
    studio_result = await db.execute(
        select(UserStudio.studio_id, func.count(distinct(UserStudio.user_id)))
        .where(UserStudio.is_active.is_(True))
        .group_by(UserStudio.studio_id)
    )
    users_by_studio = {row[0]: row[1] for row in studio_result.all()}

    # 3. Course progress
    course_progress_result = await db.execute(
        select(
            Course.id,
            Course.title,
            func.count(distinct(case(
                (LessonProgress.status == LessonProgressStatus.in_progress, LessonProgress.user_id),
                else_=None,
            ))).label("started"),
            func.count(distinct(case(
                (LessonProgress.status == LessonProgressStatus.completed, LessonProgress.user_id),
                else_=None,
            ))).label("completed"),
        )
        .outerjoin(Course.modules_rel if hasattr(Course, 'modules_rel') else None)
        # Use raw join instead
    )
    # Simplified: use separate queries for clarity
    from app.models.course import Module
    from app.models.lesson import Lesson

    course_result = await db.execute(select(Course.id, Course.title))
    courses = course_result.all()

    course_progress = []
    for course_id, course_title in courses:
        # Get lesson IDs for this course
        lesson_ids_result = await db.execute(
            select(Lesson.id)
            .join(Module, Lesson.module_id == Module.id)
            .where(Module.course_id == course_id)
        )
        lesson_ids = [r[0] for r in lesson_ids_result.all()]

        started = 0
        completed = 0
        if lesson_ids:
            progress_result = await db.execute(
                select(
                    LessonProgress.user_id,
                    func.bool_or(LessonProgress.status == LessonProgressStatus.in_progress).label("has_started"),
                    func.bool_and(LessonProgress.status == LessonProgressStatus.completed).label("all_completed"),
                )
                .where(LessonProgress.lesson_id.in_(lesson_ids))
                .group_by(LessonProgress.user_id)
            )
            for row in progress_result.all():
                started += 1
                if row[2]:  # all_completed
                    completed += 1

        course_progress.append({
            "course_id": course_id,
            "title": course_title,
            "users_started": started,
            "users_completed": completed,
        })

    # 4. Problematic tests (most attempts, low pass rate)
    problem_tests_result = await db.execute(
        select(
            TestAttempt.test_id,
            func.count(TestAttempt.id).label("total_attempts"),
            func.avg(case((TestAttempt.passed.is_(True), 1), else_=0)).label("pass_rate"),
        )
        .group_by(TestAttempt.test_id)
        .order_by(func.avg(case((TestAttempt.passed.is_(True), 1), else_=0)))
        .limit(10)
    )
    problem_tests = []
    for row in problem_tests_result.all():
        test_res = await db.execute(select(Test.lesson_id).where(Test.id == row[0]))
        lesson_id = test_res.scalar()
        problem_tests.append({
            "test_id": row[0],
            "lesson_id": lesson_id,
            "total_attempts": row[1],
            "pass_rate_pct": round(float(row[2] or 0) * 100, 1),
        })

    # 5. Inactive users (last_seen > 7 days ago)
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    inactive_result = await db.execute(
        select(User.id, User.full_name, User.role, User.last_seen_at)
        .where(
            (User.last_seen_at < cutoff) | (User.last_seen_at.is_(None)),
            User.is_active.is_(True),
        )
        .order_by(User.last_seen_at.nulls_first())
    )
    inactive_users = [
        {
            "user_id": row[0],
            "full_name": row[1],
            "role": row[2].value,
            "last_seen_at": row[3].isoformat() if row[3] else None,
        }
        for row in inactive_result.all()
    ]

    # 6. Service permissions summary
    perm_result = await db.execute(
        select(
            ServicePermission.service,
            func.count(ServicePermission.id).filter(ServicePermission.is_active.is_(True)).label("active"),
            func.count(ServicePermission.id).label("total"),
        )
        .group_by(ServicePermission.service)
    )
    service_summary = {
        row[0].value: {"active": row[1], "total_granted": row[2]}
        for row in perm_result.all()
    }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "users_by_role": users_by_role,
        "users_by_studio": users_by_studio,
        "course_progress": course_progress,
        "problem_tests": problem_tests,
        "inactive_users": inactive_users,
        "service_permissions": service_summary,
    }
