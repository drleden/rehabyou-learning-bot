"""
Block 10: payments table + subscription status + promo discount.

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-06
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    # ── subscriptions: add status column ─────────────────────────────────────
    op.add_column(
        "subscriptions",
        sa.Column(
            "status",
            sa.String(30),
            nullable=False,
            server_default="trial",
        ),
    )

    # ── promo_codes: add discount_percent column ──────────────────────────────
    op.add_column(
        "promo_codes",
        sa.Column(
            "discount_percent",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )

    # ── payments table ────────────────────────────────────────────────────────
    op.create_table(
        "payments",
        sa.Column("id",               sa.Integer(),    primary_key=True),
        sa.Column("org_id",           sa.Integer(),
                  sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("yookassa_id",      sa.String(100),  unique=True),
        sa.Column("amount_kopecks",   sa.Integer(),    nullable=False),
        sa.Column("description",      sa.String(255)),
        sa.Column("status",           sa.String(30),   nullable=False,
                  server_default="pending"),
        sa.Column("plan_name",        sa.String(100)),
        sa.Column("confirmation_url", sa.Text()),
        sa.Column("paid_at",          sa.DateTime(timezone=True)),
        sa.Column("created_at",       sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_payments_yookassa_id", "payments", ["yookassa_id"])


def downgrade():
    op.drop_table("payments")
    op.drop_column("promo_codes", "discount_percent")
    op.drop_column("subscriptions", "status")
