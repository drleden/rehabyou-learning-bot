"""
Background scheduler (APScheduler + asyncio).

Jobs:
  every_30min  — runs all monitoring checks + flushes pending notifications
  weekly_digest — every Monday 09:00 MSK → AI digest → superadmin/owner Telegram
"""
import logging
from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import func, select

from database import AsyncSessionLocal
from config import settings

logger = logging.getLogger(__name__)

MSK = timezone(timedelta(hours=3))
scheduler = AsyncIOScheduler(timezone=MSK)


# ── helpers ───────────────────────────────────────────────────────────────────

def _days_ago(n: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=n)

def _hours_ago(n: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(hours=n)

def _full_name(u) -> str:
    parts = [u.first_name or "", u.last_name or ""]
    return " ".join(p for p in parts if p) or u.phone or f"user#{u.id}"


async def _notify(db, user_id: int, telegram_id, text: str, notif_type: str):
    from services.notification_service import send_notification
    await send_notification(db, user_id, telegram_id, text, notif_type)


# ── Job 1: inactive masters (3 days) → senior_master of branch ───────────────

async def _check_inactive_masters(db):
    from models.users import User, UserStatus
    from models.users import Notification

    cutoff = _days_ago(3)
    # Find active masters who haven't been active for 3+ days
    rows = await db.execute(
        select(User).where(
            User.status == UserStatus.active,
            User.roles.overlap(["master", "senior_master"]),
            (User.last_active_at < cutoff) | (User.last_active_at.is_(None)),
        )
    )
    inactive = rows.scalars().all()
    if not inactive:
        return

    for master in inactive:
        name = _full_name(master)
        notif_type = f"inactive_master:{master.id}"

        # Check if we already sent this notification in last 24h to avoid spam
        recent = await db.execute(
            select(Notification).where(
                Notification.user_id == master.id,
                Notification.type == notif_type,
                Notification.created_at > _hours_ago(24),
            ).limit(1)
        )
        if recent.scalar():
            continue

        # Find senior_masters of the same branch
        if not master.branch_ids:
            continue

        seniors_q = await db.execute(
            select(User).where(
                User.status == UserStatus.active,
                User.roles.overlap(["senior_master"]),
                User.branch_ids.overlap(master.branch_ids),
            )
        )
        seniors = seniors_q.scalars().all()

        days_inactive = (datetime.now(timezone.utc) - (
            master.last_active_at.replace(tzinfo=timezone.utc)
            if master.last_active_at and master.last_active_at.tzinfo is None
            else (master.last_active_at or _days_ago(3))
        )).days

        # Check escalation: was senior notified 48h+ ago with no reaction?
        senior_notif = await db.execute(
            select(Notification).where(
                Notification.type == f"inactive_escalation_senior:{master.id}",
                Notification.created_at > _hours_ago(96),
            ).order_by(Notification.created_at.desc()).limit(1)
        )
        senior_notif_row = senior_notif.scalar()

        if senior_notif_row:
            # Senior was notified — check if 48h passed for manager escalation
            age_h = (datetime.now(timezone.utc) - senior_notif_row.created_at.replace(
                tzinfo=timezone.utc if senior_notif_row.created_at.tzinfo is None else senior_notif_row.created_at.tzinfo
            )).total_seconds() / 3600

            if age_h >= 96:
                # 96h = 48h (senior) + 48h (manager) → superadmin
                sa_ids = settings.superadmin_ids
                for sa_tg in sa_ids:
                    db.add(__import__('models.users', fromlist=['Notification']).Notification(
                        user_id=master.id,
                        type=f"inactive_escalation_superadmin:{master.id}",
                        payload=f"🚨 <b>Эскалация:</b> {name} не заходил {days_inactive} дн. Менеджер не среагировал.",
                        is_sent=False,
                    ))
                await _escalate_to_role(db, master, name, days_inactive, "manager",
                                        f"inactive_escalation_manager:{master.id}")
            elif age_h >= 48:
                # 48h passed → escalate to manager
                await _escalate_to_role(db, master, name, days_inactive, "manager",
                                        f"inactive_escalation_manager:{master.id}")
        else:
            # First notification → send to senior_masters
            text = f"⚠️ <b>{name}</b> не заходил в платформу {days_inactive} дн. Проверьте ситуацию."
            for senior in seniors:
                await _notify(db, master.id, senior.telegram_id, text,
                              f"inactive_escalation_senior:{master.id}")


async def _escalate_to_role(db, master, name: str, days: int, role: str, notif_type: str):
    from models.users import User, UserStatus

    # Check not already sent
    from models.users import Notification
    recent = await db.execute(
        select(Notification).where(
            Notification.type == notif_type,
            Notification.created_at > _hours_ago(24),
        ).limit(1)
    )
    if recent.scalar():
        return

    rows = await db.execute(
        select(User).where(
            User.status == UserStatus.active,
            User.roles.overlap([role]),
            User.branch_ids.overlap(master.branch_ids) if master.branch_ids else True,
        )
    )
    recipients = rows.scalars().all()
    text = f"⚠️ <b>{name}</b> не заходил {days} дн. Senior не среагировал. Требуется вмешательство."
    for r in recipients:
        await _notify(db, master.id, r.telegram_id, text, notif_type)


# ── Job 2: 10+ test attempts on same test → notify senior + manager ──────────

async def _check_test_struggles(db):
    from models.courses import TestAttempt
    from models.users import User, UserStatus, Notification

    # Group attempts: user_id, test_id → count
    rows = await db.execute(
        select(
            TestAttempt.user_id,
            TestAttempt.test_id,
            func.count(TestAttempt.id).label("cnt"),
        ).group_by(TestAttempt.user_id, TestAttempt.test_id)
        .having(func.count(TestAttempt.id) >= 10)
    )
    for user_id, test_id, cnt in rows:
        notif_type = f"test_struggle:{user_id}:{test_id}"
        recent = await db.execute(
            select(Notification).where(
                Notification.user_id == user_id,
                Notification.type == notif_type,
                Notification.created_at > _hours_ago(48),
            ).limit(1)
        )
        if recent.scalar():
            continue

        master = await db.get(User, user_id)
        if not master or not master.branch_ids:
            continue
        name = _full_name(master)
        text = f"🔄 <b>{name}</b> сделал {cnt} попыток одного теста. Нужна помощь."

        seniors_q = await db.execute(
            select(User).where(
                User.status == UserStatus.active,
                User.roles.overlap(["senior_master", "manager"]),
                User.branch_ids.overlap(master.branch_ids),
            )
        )
        for recipient in seniors_q.scalars().all():
            await _notify(db, user_id, recipient.telegram_id, text, notif_type)


# ── Job 3: course deadline in 3 days, not completed → notify master ──────────

async def _check_course_deadlines(db):
    """
    Uses hired_at as a proxy: if master was hired 25+ days ago and their course
    completion rate is below 100%, treat it as approaching deadline (30-day target).
    """
    from models.users import User, UserStatus, Notification
    from models.courses import Course, Module, Lesson, UserProgress, CourseRole

    # Find active masters hired 25–30 days ago (3 days left in 30-day window)
    hired_after  = _days_ago(30)
    hired_before = _days_ago(25)

    rows = await db.execute(
        select(User).where(
            User.status == UserStatus.active,
            User.roles.overlap(["master", "senior_master"]),
            User.hired_at.between(hired_after, hired_before),
        )
    )
    masters = rows.scalars().all()

    for master in masters:
        notif_type = f"course_deadline:{master.id}"
        recent = await db.execute(
            select(Notification).where(
                Notification.user_id == master.id,
                Notification.type == notif_type,
                Notification.created_at > _hours_ago(24),
            ).limit(1)
        )
        if recent.scalar():
            continue

        # Check if all their course lessons are completed
        master_roles = master.roles or []
        cr_q = await db.execute(
            select(CourseRole.course_id).where(CourseRole.role.in_(master_roles))
        )
        course_ids = [r for (r,) in cr_q.all()]
        if not course_ids:
            continue

        lesson_q = await db.execute(
            select(func.count(Lesson.id))
            .join(Module, Lesson.module_id == Module.id)
            .where(Module.course_id.in_(course_ids), Lesson.is_published == True)
        )
        total_lessons = lesson_q.scalar() or 0
        if total_lessons == 0:
            continue

        completed_q = await db.execute(
            select(func.count(UserProgress.id)).where(
                UserProgress.user_id == master.id,
                UserProgress.is_completed == True,
            )
        )
        completed = completed_q.scalar() or 0

        if completed < total_lessons:
            days_left = 30 - (datetime.now(timezone.utc) - master.hired_at.replace(
                tzinfo=timezone.utc if master.hired_at.tzinfo is None else master.hired_at.tzinfo
            )).days
            name = _full_name(master)
            text = (
                f"📚 <b>{name}</b>, до конца обучающего периода осталось "
                f"<b>{days_left} дн.</b> Вы прошли {completed}/{total_lessons} уроков. "
                "Не забудьте завершить курс!"
            )
            await _notify(db, master.id, master.telegram_id, text, notif_type)


# ── Job 4: 2+ academy skips → notify senior + manager ────────────────────────

async def _check_academy_skips(db):
    from models.academy import SkipCounter
    from models.users import User, UserStatus, Notification

    rows = await db.execute(
        select(SkipCounter).where(SkipCounter.count >= 2)
    )
    for sc in rows.scalars().all():
        notif_type = f"academy_skip:{sc.user_id}:{sc.count}"
        recent = await db.execute(
            select(Notification).where(
                Notification.user_id == sc.user_id,
                Notification.type == notif_type,
                Notification.created_at > _hours_ago(48),
            ).limit(1)
        )
        if recent.scalar():
            continue

        master = await db.get(User, sc.user_id)
        if not master or not master.branch_ids:
            continue
        name = _full_name(master)
        text = f"⚠️ У <b>{name}</b> {sc.count} пропуска занятий академии."

        recipients_q = await db.execute(
            select(User).where(
                User.status == UserStatus.active,
                User.roles.overlap(["senior_master", "manager"]),
                User.branch_ids.overlap(master.branch_ids),
            )
        )
        for recipient in recipients_q.scalars().all():
            await _notify(db, sc.user_id, recipient.telegram_id, text, notif_type)


# ── Main 30-minute job ────────────────────────────────────────────────────────

async def job_every_30min():
    logger.info("Scheduler: running 30-min checks")
    async with AsyncSessionLocal() as db:
        try:
            await _check_inactive_masters(db)
            await _check_test_struggles(db)
            await _check_course_deadlines(db)
            await _check_academy_skips(db)

            from services.notification_service import flush_pending
            sent = await flush_pending(db)
            if sent:
                logger.info("Scheduler: flushed %d pending notifications", sent)
        except Exception:
            logger.exception("Scheduler: error in 30-min job")


# ── Weekly digest job ─────────────────────────────────────────────────────────

async def job_weekly_digest():
    logger.info("Scheduler: generating weekly digest")
    from services import ai_service
    from services.notification_service import _tg_send
    from models.users import User, UserStatus
    from models.courses import Course, Lesson, Module, UserProgress, TestAttempt
    from datetime import timedelta

    async with AsyncSessionLocal() as db:
        try:
            now = datetime.now(timezone.utc)
            week_ago = now - timedelta(days=7)

            # Collect stats
            total_users_q = await db.execute(
                select(func.count(User.id)).where(User.status == UserStatus.active)
            )
            total_users = total_users_q.scalar() or 0

            active_q = await db.execute(
                select(func.count(User.id)).where(
                    User.status == UserStatus.active,
                    User.last_active_at > week_ago,
                )
            )
            active_this_week = active_q.scalar() or 0

            inactive_q = await db.execute(
                select(func.count(User.id)).where(
                    User.status == UserStatus.active,
                    (User.last_active_at < (now - timedelta(days=3))) | User.last_active_at.is_(None),
                )
            )
            inactive_3d = inactive_q.scalar() or 0

            completions_q = await db.execute(
                select(func.count(UserProgress.id)).where(
                    UserProgress.is_completed == True,
                    UserProgress.completed_at > week_ago,
                )
            )
            completions = completions_q.scalar() or 0

            attempts_q = await db.execute(
                select(func.count(TestAttempt.id)).where(
                    TestAttempt.created_at > week_ago
                )
            )
            test_attempts = attempts_q.scalar() or 0

            passed_q = await db.execute(
                select(func.count(TestAttempt.id)).where(
                    TestAttempt.created_at > week_ago,
                    TestAttempt.passed == True,
                )
            )
            tests_passed = passed_q.scalar() or 0

            stats = {
                "period": "последние 7 дней",
                "active_users": total_users,
                "active_this_week": active_this_week,
                "inactive_3_plus_days": inactive_3d,
                "lessons_completed": completions,
                "test_attempts": test_attempts,
                "tests_passed": tests_passed,
            }

            try:
                digest_text = await ai_service.generate_digest(stats)
            except Exception as e:
                logger.warning("AI digest generation failed: %s", e)
                digest_text = (
                    f"📊 <b>Еженедельная сводка</b>\n\n"
                    f"Активных пользователей: {total_users}\n"
                    f"Активных за неделю: {active_this_week}\n"
                    f"Неактивных 3+ дней: {inactive_3d}\n"
                    f"Уроков пройдено: {completions}\n"
                    f"Попыток тестов: {test_attempts} (успешных: {tests_passed})"
                )

            msg = f"📊 <b>Еженедельный ИИ-дайджест</b>\n\n{digest_text}"

            # Send to superadmin/owner by telegram_id from config
            for tg_id in settings.superadmin_ids:
                await _tg_send(tg_id, msg)

            # Also send to all owner/superadmin users in DB
            admins_q = await db.execute(
                select(User).where(
                    User.status == UserStatus.active,
                    User.roles.overlap(["superadmin", "owner"]),
                    User.telegram_id.isnot(None),
                )
            )
            sent_ids = set(settings.superadmin_ids)
            for admin in admins_q.scalars().all():
                if admin.telegram_id not in sent_ids:
                    await _tg_send(admin.telegram_id, msg)
                    sent_ids.add(admin.telegram_id)

            logger.info("Weekly digest sent to %d recipients", len(sent_ids))
        except Exception:
            logger.exception("Scheduler: error in weekly digest job")


# ── Scheduler setup ───────────────────────────────────────────────────────────

def start_scheduler():
    scheduler.add_job(
        job_every_30min,
        trigger=IntervalTrigger(minutes=30),
        id="every_30min",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        job_weekly_digest,
        trigger=CronTrigger(day_of_week="mon", hour=9, minute=0, timezone=MSK),
        id="weekly_digest",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    logger.info("Scheduler started (30-min checks + weekly digest on Monday 09:00 MSK)")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
