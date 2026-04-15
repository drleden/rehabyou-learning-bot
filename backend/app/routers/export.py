from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import and_, case, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_role
from app.models.course import Course, Module
from app.models.lesson import Lesson, LessonProgress, LessonProgressStatus
from app.models.permission import ServicePermission
from app.models.studio import Studio, UserStudio
from app.models.test import Test, TestAttempt
from app.models.user import User, UserRole

router = APIRouter(prefix="/export", tags=["export"])


SERVICE_LABELS = {
    "classic": "Классический массаж",
    "sport": "Спортивный массаж",
    "relax": "Расслабляющий массаж",
    "anticellulite": "Антицеллюлитный массаж",
    "face": "Массаж лица",
    "taping": "Тейпирование",
    "stones": "Массаж камнями",
}


def _full_name(first: str | None, last: str | None) -> str:
    return f"{first or ''} {last or ''}".strip()


@router.get("/snapshot")
async def snapshot(
    current_user: User = Depends(require_role(UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # ─── 1. Users by role ────────────────────────────────────────────────
    role_res = await db.execute(select(User.role, func.count(User.id)).group_by(User.role))
    users_by_role = {row[0].value: row[1] for row in role_res.all()}

    total_users = sum(users_by_role.values())

    # ─── Top-level metrics ───────────────────────────────────────────────
    active_today_res = await db.execute(
        select(func.count(User.id)).where(User.last_seen_at >= today_start)
    )
    active_today = active_today_res.scalar() or 0

    perms_active_res = await db.execute(
        select(func.count(ServicePermission.id)).where(ServicePermission.is_active.is_(True))
    )
    permissions_active_count = perms_active_res.scalar() or 0

    # ─── 2. Users by studio ──────────────────────────────────────────────
    studios_res = await db.execute(select(Studio).order_by(Studio.id))
    studios = studios_res.scalars().all()

    users_by_studio = []
    for s in studios:
        members_res = await db.execute(
            select(User.is_active, User.is_blocked)
            .join(UserStudio, UserStudio.user_id == User.id)
            .where(UserStudio.studio_id == s.id, UserStudio.is_active.is_(True))
        )
        rows = members_res.all()
        total = len(rows)
        active = sum(1 for r in rows if r[0] and not r[1])
        blocked = sum(1 for r in rows if r[1])
        users_by_studio.append({
            "studio_name": s.name,
            "city": s.city,
            "total": total,
            "active": active,
            "blocked": blocked,
        })

    # ─── 3. Course progress ──────────────────────────────────────────────
    courses_res = await db.execute(select(Course).order_by(Course.id))
    courses = courses_res.scalars().all()

    course_progress = []
    avg_percents = []
    for c in courses:
        lesson_ids_res = await db.execute(
            select(Lesson.id).join(Module, Lesson.module_id == Module.id).where(Module.course_id == c.id)
        )
        lesson_ids = [r[0] for r in lesson_ids_res.all()]
        total_lessons = len(lesson_ids)

        total_enrolled = 0
        completed = 0
        in_progress = 0
        not_started = 0
        user_percents = []

        if total_lessons > 0:
            progress_res = await db.execute(
                select(
                    LessonProgress.user_id,
                    func.count(
                        case((LessonProgress.status == LessonProgressStatus.completed, 1))
                    ).label("completed_count"),
                    func.count(LessonProgress.id).label("any_count"),
                )
                .where(LessonProgress.lesson_id.in_(lesson_ids))
                .group_by(LessonProgress.user_id)
            )
            for row in progress_res.all():
                total_enrolled += 1
                comp = int(row[1] or 0)
                if comp == total_lessons:
                    completed += 1
                elif comp > 0 or int(row[2] or 0) > 0:
                    in_progress += 1
                user_percents.append(round(comp / total_lessons * 100))

        # Не начинали — студенты, у которых нет ни одной записи прогресса.
        # Для простоты считаем от числа пользователей в целевых ролях.
        if c.target_roles:
            target_users_res = await db.execute(
                select(func.count(User.id)).where(
                    User.role.in_(c.target_roles),
                    User.is_active.is_(True),
                )
            )
            target_total = target_users_res.scalar() or 0
            not_started = max(0, target_total - total_enrolled)

        avg_percent = round(sum(user_percents) / len(user_percents)) if user_percents else 0
        avg_percents.append(avg_percent)

        course_progress.append({
            "course_id": c.id,
            "course_title": c.title,
            "total_enrolled": total_enrolled,
            "completed": completed,
            "in_progress": in_progress,
            "not_started": not_started,
            "avg_percent": avg_percent,
        })

    avg_course_progress = round(sum(avg_percents) / len(avg_percents)) if avg_percents else 0

    # ─── 4. Problem lessons (top 5 with most in_progress / unfinished) ───
    problem_lessons_res = await db.execute(
        select(
            Lesson.id,
            Lesson.title,
            func.count(LessonProgress.id).label("unfinished"),
        )
        .join(LessonProgress, LessonProgress.lesson_id == Lesson.id)
        .where(LessonProgress.status == LessonProgressStatus.in_progress)
        .group_by(Lesson.id, Lesson.title)
        .order_by(func.count(LessonProgress.id).desc())
        .limit(5)
    )
    problem_lessons = [
        {"lesson_id": row[0], "lesson_title": row[1], "unfinished_count": row[2]}
        for row in problem_lessons_res.all()
    ]

    # ─── 5. Test stats per lesson ────────────────────────────────────────
    test_stats_res = await db.execute(
        select(
            Test.id,
            Test.lesson_id,
            Lesson.title,
            func.count(TestAttempt.id).label("total"),
            func.count(case((TestAttempt.passed.is_(False), 1))).label("failed"),
            func.avg(case((TestAttempt.passed.is_(True), 1.0), else_=0.0)).label("pass_rate"),
        )
        .join(Lesson, Test.lesson_id == Lesson.id)
        .outerjoin(TestAttempt, TestAttempt.test_id == Test.id)
        .group_by(Test.id, Test.lesson_id, Lesson.title)
        .order_by(func.count(TestAttempt.id).desc())
    )
    test_stats = [
        {
            "test_id": row[0],
            "lesson_id": row[1],
            "lesson_title": row[2],
            "attempts_total": int(row[3] or 0),
            "attempts_failed": int(row[4] or 0),
            "pass_rate_percent": round(float(row[5] or 0) * 100, 1),
        }
        for row in test_stats_res.all()
    ]

    # ─── 6. Inactive users (> 7 days) ────────────────────────────────────
    cutoff = now - timedelta(days=7)
    inactive_res = await db.execute(
        select(User.id, User.first_name, User.last_name, User.role, User.last_seen_at)
        .where(
            (User.last_seen_at < cutoff) | (User.last_seen_at.is_(None)),
            User.is_active.is_(True),
            User.is_blocked.is_(False),
        )
        .order_by(User.last_seen_at.nulls_first())
    )
    inactive_users = []
    for row in inactive_res.all():
        last_seen = row[4]
        days = (now - last_seen).days if last_seen else None
        inactive_users.append({
            "user_id": row[0],
            "full_name": _full_name(row[1], row[2]),
            "role": row[3].value,
            "last_seen_at": last_seen.isoformat() if last_seen else None,
            "days_inactive": days,
        })

    # ─── 7. Permissions summary per service ──────────────────────────────
    perm_res = await db.execute(
        select(
            ServicePermission.service,
            func.count(ServicePermission.id).label("count"),
        )
        .where(ServicePermission.is_active.is_(True))
        .group_by(ServicePermission.service)
    )
    perm_map = {row[0].value: row[1] for row in perm_res.all()}
    permissions_summary = [
        {"service": s, "service_name": SERVICE_LABELS[s], "count_active": perm_map.get(s, 0)}
        for s in SERVICE_LABELS.keys()
    ]

    # ─── 8. Top students (by average course progress) ────────────────────
    all_lessons_res = await db.execute(select(func.count(Lesson.id)))
    total_lessons_all = all_lessons_res.scalar() or 0

    top_students = []
    if total_lessons_all > 0:
        top_res = await db.execute(
            select(
                User.id,
                User.first_name,
                User.last_name,
                User.role,
                func.count(
                    case((LessonProgress.status == LessonProgressStatus.completed, 1))
                ).label("completed"),
            )
            .join(LessonProgress, LessonProgress.user_id == User.id)
            .where(User.is_active.is_(True))
            .group_by(User.id, User.first_name, User.last_name, User.role)
            .order_by(
                func.count(
                    case((LessonProgress.status == LessonProgressStatus.completed, 1))
                ).desc()
            )
            .limit(5)
        )
        for row in top_res.all():
            completed_cnt = int(row[4] or 0)
            percent = round(completed_cnt / total_lessons_all * 100)
            top_students.append({
                "user_id": row[0],
                "full_name": _full_name(row[1], row[2]),
                "role": row[3].value,
                "completed_lessons": completed_cnt,
                "progress_percent": percent,
            })

    return {
        "generated_at": now.isoformat(),
        "totals": {
            "users": total_users,
            "active_today": active_today,
            "avg_course_progress": avg_course_progress,
            "permissions_active": permissions_active_count,
            "courses": len(courses),
            "studios": len(studios),
        },
        "users_by_role": users_by_role,
        "users_by_studio": users_by_studio,
        "course_progress": course_progress,
        "problem_lessons": problem_lessons,
        "test_stats": test_stats,
        "inactive_users": inactive_users,
        "permissions_summary": permissions_summary,
        "top_students": top_students,
    }
