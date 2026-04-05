"""Initial schema — all tables

Revision ID: 0001
Revises:
Create Date: 2026-04-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# Enum helpers
# ---------------------------------------------------------------------------

def _create_enum(name: str, *values: str) -> None:
    op.execute(f"CREATE TYPE IF NOT EXISTS {name} AS ENUM ({', '.join(repr(v) for v in values)})")


def _drop_enum(name: str) -> None:
    op.execute(f"DROP TYPE IF EXISTS {name}")


# ---------------------------------------------------------------------------
# Upgrade
# ---------------------------------------------------------------------------

def upgrade() -> None:

    # ── Enum types ──────────────────────────────────────────────────────────
    _create_enum("userstatus",        "active", "fired", "blocked", "trial")
    _create_enum("lessonstatus",      "draft", "published")
    _create_enum("assignmentstatus",  "pending", "accepted", "rejected")
    _create_enum("novicestatus",      "in_training", "base_certified",
                                      "full_certified", "blocked", "failed")
    _create_enum("attestationresult", "pending", "passed", "failed")
    _create_enum("permissionstatus",  "permitted", "not_permitted")
    _create_enum("integrationtype",   "yclients", "bitrix24", "analytics")

    # ── organizations ───────────────────────────────────────────────────────
    op.create_table(
        "organizations",
        sa.Column("id",         sa.Integer(),     primary_key=True),
        sa.Column("name",       sa.String(255),   nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── branches ────────────────────────────────────────────────────────────
    op.create_table(
        "branches",
        sa.Column("id",         sa.Integer(),   primary_key=True),
        sa.Column("org_id",     sa.Integer(),
                  sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("name",       sa.String(255), nullable=False),
        sa.Column("city",       sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── users ───────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id",                sa.Integer(),    primary_key=True),
        sa.Column("telegram_id",       sa.BigInteger(), unique=True, index=True),
        sa.Column("phone",             sa.String(20),   nullable=False),
        sa.Column("first_name",        sa.String(100)),
        sa.Column("last_name",         sa.String(100)),
        sa.Column("username",          sa.String(100)),
        sa.Column("org_id",            sa.Integer(),
                  sa.ForeignKey("organizations.id")),
        sa.Column("roles",             postgresql.ARRAY(sa.String()),
                  nullable=False, server_default="{}"),
        sa.Column("branch_ids",        postgresql.ARRAY(sa.Integer()),
                  nullable=False, server_default="{}"),
        sa.Column("status",
                  sa.Enum("active", "fired", "blocked", "trial",
                          name="userstatus", create_type=False),
                  nullable=False, server_default="trial"),
        sa.Column("yclients_staff_id", sa.String(100)),
        sa.Column("bitrix_user_id",    sa.String(100)),
        sa.Column("hired_at",          sa.DateTime(timezone=True)),
        sa.Column("fired_at",          sa.DateTime(timezone=True)),
        sa.Column("last_active_at",    sa.DateTime(timezone=True)),
        sa.Column("created_at",        sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
        sa.Column("updated_at",        sa.DateTime(timezone=True),
                  onupdate=sa.text("now()")),
    )

    # ── subscriptions ────────────────────────────────────────────────────────
    op.create_table(
        "subscriptions",
        sa.Column("id",         sa.Integer(),  primary_key=True),
        sa.Column("org_id",     sa.Integer(),
                  sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("plan_name",  sa.String(100)),
        sa.Column("max_users",  sa.Integer()),
        sa.Column("price",      sa.Integer()),
        sa.Column("starts_at",  sa.DateTime(timezone=True)),
        sa.Column("ends_at",    sa.DateTime(timezone=True)),
        sa.Column("is_active",  sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── promo_codes ──────────────────────────────────────────────────────────
    op.create_table(
        "promo_codes",
        sa.Column("id",         sa.Integer(),  primary_key=True),
        sa.Column("code",       sa.String(50), nullable=False, unique=True),
        sa.Column("org_id",     sa.Integer(),  sa.ForeignKey("organizations.id")),
        sa.Column("is_used",    sa.Boolean(),  server_default="false"),
        sa.Column("used_by",    sa.Integer(),  sa.ForeignKey("users.id")),
        sa.Column("used_at",    sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("created_by", sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── notifications ────────────────────────────────────────────────────────
    op.create_table(
        "notifications",
        sa.Column("id",           sa.Integer(),  primary_key=True),
        sa.Column("user_id",      sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("type",         sa.String(100), nullable=False),
        sa.Column("payload",      sa.Text()),
        sa.Column("is_sent",      sa.Boolean(), server_default="false"),
        sa.Column("scheduled_at", sa.DateTime(timezone=True)),
        sa.Column("sent_at",      sa.DateTime(timezone=True)),
        sa.Column("created_at",   sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── badges ───────────────────────────────────────────────────────────────
    op.create_table(
        "badges",
        sa.Column("id",              sa.Integer(),    primary_key=True),
        sa.Column("name",            sa.String(100),  nullable=False),
        sa.Column("description",     sa.Text()),
        sa.Column("icon_url",        sa.String(500)),
        sa.Column("condition_type",  sa.String(100)),
        sa.Column("condition_value", sa.String(255)),
    )

    # ── user_badges ──────────────────────────────────────────────────────────
    op.create_table(
        "user_badges",
        sa.Column("id",         sa.Integer(), primary_key=True),
        sa.Column("user_id",    sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("badge_id",   sa.Integer(),
                  sa.ForeignKey("badges.id"), nullable=False),
        sa.Column("awarded_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── audit_log ────────────────────────────────────────────────────────────
    op.create_table(
        "audit_log",
        sa.Column("id",             sa.Integer(), primary_key=True),
        sa.Column("actor_id",       sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("target_user_id", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("action",         sa.String(255), nullable=False),
        sa.Column("details",        sa.Text()),
        sa.Column("created_at",     sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── system_announcements ─────────────────────────────────────────────────
    op.create_table(
        "system_announcements",
        sa.Column("id",           sa.Integer(),    primary_key=True),
        sa.Column("title",        sa.String(255),  nullable=False),
        sa.Column("body",         sa.Text(),       nullable=False),
        sa.Column("target_roles", postgresql.ARRAY(sa.String())),
        sa.Column("target_org_id",sa.Integer(),
                  sa.ForeignKey("organizations.id")),
        sa.Column("created_by",   sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at",   sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── offline_cache_meta ───────────────────────────────────────────────────
    op.create_table(
        "offline_cache_meta",
        sa.Column("id",            sa.Integer(),  primary_key=True),
        sa.Column("user_id",       sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("resource_type", sa.String(100)),
        sa.Column("resource_id",   sa.Integer()),
        sa.Column("cached_at",     sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
        sa.Column("expires_at",    sa.DateTime(timezone=True)),
    )

    # ── courses ──────────────────────────────────────────────────────────────
    op.create_table(
        "courses",
        sa.Column("id",          sa.Integer(),    primary_key=True),
        sa.Column("title",       sa.String(255),  nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("is_active",   sa.Boolean(),    server_default="true"),
        sa.Column("created_by",  sa.Integer(),    sa.ForeignKey("users.id")),
        sa.Column("created_at",  sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
        sa.Column("updated_at",  sa.DateTime(timezone=True)),
    )

    # ── course_roles ─────────────────────────────────────────────────────────
    op.create_table(
        "course_roles",
        sa.Column("id",        sa.Integer(),   primary_key=True),
        sa.Column("course_id", sa.Integer(),
                  sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("role",      sa.String(50),  nullable=False),
    )

    # ── modules ──────────────────────────────────────────────────────────────
    op.create_table(
        "modules",
        sa.Column("id",          sa.Integer(),   primary_key=True),
        sa.Column("course_id",   sa.Integer(),
                  sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("title",       sa.String(255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("position",    sa.Integer(),   nullable=False, server_default="0"),
        sa.Column("created_at",  sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── lessons ──────────────────────────────────────────────────────────────
    op.create_table(
        "lessons",
        sa.Column("id",         sa.Integer(),     primary_key=True),
        sa.Column("module_id",  sa.Integer(),
                  sa.ForeignKey("modules.id"), nullable=False),
        sa.Column("title",      sa.String(255),   nullable=False),
        sa.Column("content",    sa.Text()),
        sa.Column("video_url",  sa.String(1000)),
        sa.Column("position",   sa.Integer(),     nullable=False, server_default="0"),
        sa.Column("status",
                  sa.Enum("draft", "published",
                          name="lessonstatus", create_type=False),
                  nullable=False, server_default="draft"),
        sa.Column("created_by", sa.Integer(),     sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )

    # ── lesson_versions ──────────────────────────────────────────────────────
    op.create_table(
        "lesson_versions",
        sa.Column("id",         sa.Integer(),    primary_key=True),
        sa.Column("lesson_id",  sa.Integer(),
                  sa.ForeignKey("lessons.id"), nullable=False),
        sa.Column("content",    sa.Text()),
        sa.Column("video_url",  sa.String(1000)),
        sa.Column("changed_by", sa.Integer(),    sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── tests ────────────────────────────────────────────────────────────────
    op.create_table(
        "tests",
        sa.Column("id",              sa.Integer(), primary_key=True),
        sa.Column("lesson_id",       sa.Integer(),
                  sa.ForeignKey("lessons.id"), nullable=False),
        sa.Column("pass_threshold",  sa.Float(),   server_default="0.95"),
        sa.Column("created_at",      sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── test_questions ───────────────────────────────────────────────────────
    op.create_table(
        "test_questions",
        sa.Column("id",            sa.Integer(), primary_key=True),
        sa.Column("test_id",       sa.Integer(),
                  sa.ForeignKey("tests.id"), nullable=False),
        sa.Column("question",      sa.Text(),    nullable=False),
        sa.Column("options",       postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column("correct_index", sa.Integer(), nullable=False),
        sa.Column("position",      sa.Integer(), server_default="0"),
    )

    # ── user_progress ────────────────────────────────────────────────────────
    op.create_table(
        "user_progress",
        sa.Column("id",           sa.Integer(), primary_key=True),
        sa.Column("user_id",      sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("lesson_id",    sa.Integer(),
                  sa.ForeignKey("lessons.id"), nullable=False),
        sa.Column("is_completed", sa.Boolean(), server_default="false"),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("is_archived",  sa.Boolean(), server_default="false"),
        sa.Column("created_at",   sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── test_attempts ────────────────────────────────────────────────────────
    op.create_table(
        "test_attempts",
        sa.Column("id",             sa.Integer(), primary_key=True),
        sa.Column("user_id",        sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("test_id",        sa.Integer(),
                  sa.ForeignKey("tests.id"), nullable=False),
        sa.Column("score",          sa.Float()),
        sa.Column("passed",         sa.Boolean()),
        sa.Column("answers",        postgresql.ARRAY(sa.Integer())),
        sa.Column("attempt_number", sa.Integer(), server_default="1"),
        sa.Column("created_at",     sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── assignments ──────────────────────────────────────────────────────────
    op.create_table(
        "assignments",
        sa.Column("id",          sa.Integer(), primary_key=True),
        sa.Column("lesson_id",   sa.Integer(),
                  sa.ForeignKey("lessons.id"), nullable=False),
        sa.Column("description", sa.Text(),    nullable=False),
        sa.Column("min_words",   sa.Integer(), server_default="50"),
        sa.Column("created_at",  sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── assignment_answers ───────────────────────────────────────────────────
    op.create_table(
        "assignment_answers",
        sa.Column("id",             sa.Integer(), primary_key=True),
        sa.Column("assignment_id",  sa.Integer(),
                  sa.ForeignKey("assignments.id"), nullable=False),
        sa.Column("user_id",        sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("text",           sa.Text(),    nullable=False),
        sa.Column("status",
                  sa.Enum("pending", "accepted", "rejected",
                          name="assignmentstatus", create_type=False),
                  nullable=False, server_default="pending"),
        sa.Column("ai_score",       sa.Float()),
        sa.Column("ai_comment",     sa.Text()),
        sa.Column("attempt_number", sa.Integer(), server_default="1"),
        sa.Column("created_at",     sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── questions ────────────────────────────────────────────────────────────
    op.create_table(
        "questions",
        sa.Column("id",          sa.Integer(), primary_key=True),
        sa.Column("user_id",     sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("lesson_id",   sa.Integer(),
                  sa.ForeignKey("lessons.id"), nullable=False),
        sa.Column("text",        sa.Text(),    nullable=False),
        sa.Column("is_answered", sa.Boolean(), server_default="false"),
        sa.Column("created_at",  sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── question_replies ─────────────────────────────────────────────────────
    op.create_table(
        "question_replies",
        sa.Column("id",          sa.Integer(), primary_key=True),
        sa.Column("question_id", sa.Integer(),
                  sa.ForeignKey("questions.id"), nullable=False),
        sa.Column("user_id",     sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("text",        sa.Text(),    nullable=False),
        sa.Column("created_at",  sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── academy_schedule ─────────────────────────────────────────────────────
    op.create_table(
        "academy_schedule",
        sa.Column("id",               sa.Integer(),  primary_key=True),
        sa.Column("branch_id",        sa.Integer(),
                  sa.ForeignKey("branches.id"), nullable=False),
        sa.Column("teacher_id",       sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("topic",            sa.String(255), nullable=False),
        sa.Column("description",      sa.Text()),
        sa.Column("starts_at",        sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_minutes", sa.Integer(),  server_default="60"),
        sa.Column("min_students",     sa.Integer(),  server_default="1"),
        sa.Column("is_cancelled",     sa.Boolean(),  server_default="false"),
        sa.Column("cancel_reason",    sa.Text()),
        sa.Column("created_at",       sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── academy_enrollments ──────────────────────────────────────────────────
    op.create_table(
        "academy_enrollments",
        sa.Column("id",           sa.Integer(), primary_key=True),
        sa.Column("schedule_id",  sa.Integer(),
                  sa.ForeignKey("academy_schedule.id"), nullable=False),
        sa.Column("user_id",      sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("is_mandatory", sa.Boolean(), server_default="true"),
        sa.Column("created_at",   sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── academy_attendance ───────────────────────────────────────────────────
    op.create_table(
        "academy_attendance",
        sa.Column("id",              sa.Integer(), primary_key=True),
        sa.Column("schedule_id",     sa.Integer(),
                  sa.ForeignKey("academy_schedule.id"), nullable=False),
        sa.Column("user_id",         sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("was_present",     sa.Boolean()),
        sa.Column("score",           sa.Float()),
        sa.Column("criteria_scores", sa.Text()),
        sa.Column("comment",         sa.Text()),
        sa.Column("recorded_by",     sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("recorded_at",     sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── academy_absence_notices ──────────────────────────────────────────────
    op.create_table(
        "academy_absence_notices",
        sa.Column("id",                sa.Integer(), primary_key=True),
        sa.Column("schedule_id",       sa.Integer(),
                  sa.ForeignKey("academy_schedule.id"), nullable=False),
        sa.Column("user_id",           sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("reason",            sa.Text()),
        sa.Column("noticed_at",        sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
        sa.Column("hours_before_class",sa.Float()),
        sa.Column("counts_as_skip",    sa.Boolean(), server_default="true"),
    )

    # ── academy_materials ────────────────────────────────────────────────────
    op.create_table(
        "academy_materials",
        sa.Column("id",            sa.Integer(),    primary_key=True),
        sa.Column("schedule_id",   sa.Integer(),
                  sa.ForeignKey("academy_schedule.id"), nullable=False),
        sa.Column("title",         sa.String(255),  nullable=False),
        sa.Column("file_url",      sa.String(1000)),
        sa.Column("material_type", sa.String(50)),
        sa.Column("created_at",    sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── academy_material_confirms ────────────────────────────────────────────
    op.create_table(
        "academy_material_confirms",
        sa.Column("id",           sa.Integer(), primary_key=True),
        sa.Column("material_id",  sa.Integer(),
                  sa.ForeignKey("academy_materials.id"), nullable=False),
        sa.Column("user_id",      sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── academy_novice_journal ───────────────────────────────────────────────
    op.create_table(
        "academy_novice_journal",
        sa.Column("id",                  sa.Integer(), primary_key=True),
        sa.Column("user_id",             sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False, unique=True),
        sa.Column("status",
                  sa.Enum("in_training", "base_certified", "full_certified",
                          "blocked", "failed",
                          name="novicestatus", create_type=False),
                  nullable=False, server_default="in_training"),
        sa.Column("hired_at",            sa.DateTime(timezone=True)),
        sa.Column("interview_result",    sa.Text()),
        sa.Column("psych_test_summary",  sa.Text()),
        sa.Column("total_training_hours",sa.Float(), server_default="0"),
        sa.Column("notes",               sa.Text()),
        sa.Column("updated_at",          sa.DateTime(timezone=True)),
    )

    # ── academy_feedback ─────────────────────────────────────────────────────
    op.create_table(
        "academy_feedback",
        sa.Column("id",          sa.Integer(), primary_key=True),
        sa.Column("schedule_id", sa.Integer(),
                  sa.ForeignKey("academy_schedule.id"), nullable=False),
        sa.Column("rating",      sa.Integer()),
        sa.Column("comment",     sa.Text()),
        sa.Column("created_at",  sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── academy_attestations ─────────────────────────────────────────────────
    op.create_table(
        "academy_attestations",
        sa.Column("id",             sa.Integer(), primary_key=True),
        sa.Column("user_id",        sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("requested_at",   sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
        sa.Column("scheduled_at",   sa.DateTime(timezone=True)),
        sa.Column("examiner_id",    sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("result",
                  sa.Enum("pending", "passed", "failed",
                          name="attestationresult", create_type=False),
                  server_default="pending"),
        sa.Column("notes",          sa.Text()),
        sa.Column("approved_by",    sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("approved_at",    sa.DateTime(timezone=True)),
    )

    # ── skip_counters ────────────────────────────────────────────────────────
    op.create_table(
        "skip_counters",
        sa.Column("id",            sa.Integer(), primary_key=True),
        sa.Column("user_id",       sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False, unique=True),
        sa.Column("count",         sa.Integer(), server_default="0"),
        sa.Column("last_skip_at",  sa.DateTime(timezone=True)),
        sa.Column("last_reset_by", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("last_reset_at", sa.DateTime(timezone=True)),
    )

    # ── services ─────────────────────────────────────────────────────────────
    op.create_table(
        "services",
        sa.Column("id",          sa.Integer(),    primary_key=True),
        sa.Column("name",        sa.String(255),  nullable=False, unique=True),
        sa.Column("description", sa.Text()),
        sa.Column("is_active",   sa.Boolean(),    server_default="true"),
        sa.Column("created_at",  sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── user_service_permissions ─────────────────────────────────────────────
    op.create_table(
        "user_service_permissions",
        sa.Column("id",         sa.Integer(), primary_key=True),
        sa.Column("user_id",    sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("service_id", sa.Integer(),
                  sa.ForeignKey("services.id"), nullable=False),
        sa.Column("status",
                  sa.Enum("permitted", "not_permitted",
                          name="permissionstatus", create_type=False),
                  nullable=False, server_default="not_permitted"),
        sa.Column("granted_by", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("granted_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_by", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
    )

    # ── service_permission_history ───────────────────────────────────────────
    op.create_table(
        "service_permission_history",
        sa.Column("id",            sa.Integer(), primary_key=True),
        sa.Column("permission_id", sa.Integer(),
                  sa.ForeignKey("user_service_permissions.id"), nullable=False),
        sa.Column("changed_by",    sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("old_status",
                  sa.Enum("permitted", "not_permitted",
                          name="permissionstatus", create_type=False)),
        sa.Column("new_status",
                  sa.Enum("permitted", "not_permitted",
                          name="permissionstatus", create_type=False),
                  nullable=False),
        sa.Column("reason",        sa.Text()),
        sa.Column("created_at",    sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── psych_tests ──────────────────────────────────────────────────────────
    op.create_table(
        "psych_tests",
        sa.Column("id",          sa.Integer(),    primary_key=True),
        sa.Column("name",        sa.String(255),  nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("is_active",   sa.Boolean(),    server_default="true"),
        sa.Column("created_at",  sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── psych_test_questions ─────────────────────────────────────────────────
    op.create_table(
        "psych_test_questions",
        sa.Column("id",       sa.Integer(), primary_key=True),
        sa.Column("test_id",  sa.Integer(),
                  sa.ForeignKey("psych_tests.id"), nullable=False),
        sa.Column("question", sa.Text(),    nullable=False),
        sa.Column("options",  postgresql.ARRAY(sa.String())),
        sa.Column("position", sa.Integer(), server_default="0"),
    )

    # ── psych_test_results ───────────────────────────────────────────────────
    op.create_table(
        "psych_test_results",
        sa.Column("id",                sa.Integer(), primary_key=True),
        sa.Column("user_id",           sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("test_id",           sa.Integer(),
                  sa.ForeignKey("psych_tests.id"), nullable=False),
        sa.Column("answers",           sa.Text()),
        sa.Column("raw_score",         sa.Text()),
        sa.Column("ai_interpretation", sa.Text()),
        sa.Column("ai_model_used",     sa.String(100)),
        sa.Column("created_at",        sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── integration_configs ──────────────────────────────────────────────────
    op.create_table(
        "integration_configs",
        sa.Column("id",               sa.Integer(), primary_key=True),
        sa.Column("org_id",           sa.Integer(),
                  sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("integration_type",
                  sa.Enum("yclients", "bitrix24", "analytics",
                          name="integrationtype", create_type=False),
                  nullable=False),
        sa.Column("config",           sa.Text()),
        sa.Column("is_enabled",       sa.Boolean(), server_default="false"),
        sa.Column("created_at",       sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
        sa.Column("updated_at",       sa.DateTime(timezone=True)),
    )

    # ── integration_logs ─────────────────────────────────────────────────────
    op.create_table(
        "integration_logs",
        sa.Column("id",               sa.Integer(),  primary_key=True),
        sa.Column("config_id",        sa.Integer(),
                  sa.ForeignKey("integration_configs.id")),
        sa.Column("integration_type",
                  sa.Enum("yclients", "bitrix24", "analytics",
                          name="integrationtype", create_type=False),
                  nullable=False),
        sa.Column("direction",        sa.String(10)),
        sa.Column("status",           sa.String(50)),
        sa.Column("payload",          sa.Text()),
        sa.Column("error",            sa.Text()),
        sa.Column("created_at",       sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── yclients_sync_cache ──────────────────────────────────────────────────
    op.create_table(
        "yclients_sync_cache",
        sa.Column("id",                    sa.Integer(), primary_key=True),
        sa.Column("user_id",               sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("period_start",          sa.DateTime(timezone=True)),
        sa.Column("period_end",            sa.DateTime(timezone=True)),
        sa.Column("revenue",               sa.Integer()),
        sa.Column("clients_count",         sa.Integer()),
        sa.Column("repeat_clients_count",  sa.Integer()),
        sa.Column("schedule_fill_pct",     sa.Integer()),
        sa.Column("regular_clients_count", sa.Integer()),
        sa.Column("synced_at",             sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── ai_conversations ─────────────────────────────────────────────────────
    op.create_table(
        "ai_conversations",
        sa.Column("id",          sa.Integer(),  primary_key=True),
        sa.Column("user_id",     sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role",        sa.String(20), nullable=False),
        sa.Column("content",     sa.Text(),     nullable=False),
        sa.Column("model_used",  sa.String(100)),
        sa.Column("created_at",  sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── ai_reports ───────────────────────────────────────────────────────────
    op.create_table(
        "ai_reports",
        sa.Column("id",           sa.Integer(), primary_key=True),
        sa.Column("org_id",       sa.Integer(), sa.ForeignKey("organizations.id")),
        sa.Column("branch_id",    sa.Integer(), sa.ForeignKey("branches.id")),
        sa.Column("requested_by", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("report_type",  sa.String(100)),
        sa.Column("content",      sa.Text(),    nullable=False),
        sa.Column("model_used",   sa.String(100)),
        sa.Column("created_at",   sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── ai_digest_settings ───────────────────────────────────────────────────
    op.create_table(
        "ai_digest_settings",
        sa.Column("id",                sa.Integer(),   primary_key=True),
        sa.Column("org_id",            sa.Integer(),
                  sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("recipient_user_id", sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("schedule",          sa.String(50),  server_default="MON 09:00"),
        sa.Column("is_enabled",        sa.Boolean(),   server_default="true"),
        sa.Column("last_sent_at",      sa.DateTime(timezone=True)),
        sa.Column("created_at",        sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )

    # ── Indexes ──────────────────────────────────────────────────────────────
    op.create_index("ix_users_telegram_id",   "users",        ["telegram_id"],  unique=True)
    op.create_index("ix_user_progress_user",  "user_progress", ["user_id"])
    op.create_index("ix_user_progress_lesson","user_progress", ["lesson_id"])
    op.create_index("ix_test_attempts_user",  "test_attempts", ["user_id"])
    op.create_index("ix_notifications_user",  "notifications", ["user_id", "is_sent"])
    op.create_index("ix_audit_log_actor",     "audit_log",    ["actor_id"])
    op.create_index("ix_ai_conversations_user","ai_conversations", ["user_id"])


# ---------------------------------------------------------------------------
# Downgrade
# ---------------------------------------------------------------------------

def downgrade() -> None:
    # Drop tables in reverse FK order
    for table in [
        "ai_digest_settings", "ai_reports", "ai_conversations",
        "yclients_sync_cache", "integration_logs", "integration_configs",
        "psych_test_results", "psych_test_questions", "psych_tests",
        "service_permission_history", "user_service_permissions", "services",
        "skip_counters", "academy_attestations", "academy_feedback",
        "academy_novice_journal", "academy_material_confirms",
        "academy_materials", "academy_absence_notices", "academy_attendance",
        "academy_enrollments", "academy_schedule",
        "question_replies", "questions", "assignment_answers", "assignments",
        "test_attempts", "user_progress", "test_questions", "tests",
        "lesson_versions", "lessons", "modules", "course_roles", "courses",
        "offline_cache_meta", "system_announcements", "audit_log",
        "user_badges", "badges", "notifications", "promo_codes",
        "subscriptions", "users", "branches", "organizations",
    ]:
        op.drop_table(table)

    for enum in [
        "integrationtype", "permissionstatus", "attestationresult",
        "novicestatus", "assignmentstatus", "lessonstatus", "userstatus",
    ]:
        _drop_enum(enum)
