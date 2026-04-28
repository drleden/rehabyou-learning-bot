"""add_administrator_role

Revision ID: a3f1c0d92e01
Revises: 85b8523c632c
Create Date: 2026-04-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'a3f1c0d92e01'
down_revision: Union[str, None] = '85b8523c632c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'administrator' BEFORE 'senior_master'")


def downgrade() -> None:
    pass
