"""Add password_hash and password_plain to users table.

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-10
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("password_hash", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("password_plain", sa.String(100), nullable=True))


def downgrade():
    op.drop_column("users", "password_plain")
    op.drop_column("users", "password_hash")
