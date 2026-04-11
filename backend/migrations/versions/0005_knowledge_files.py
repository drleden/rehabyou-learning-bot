"""Add file columns to knowledge_documents.

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-11
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("knowledge_documents", sa.Column("file_url", sa.String(1000)))
    op.add_column("knowledge_documents", sa.Column("file_type", sa.String(10)))
    op.add_column("knowledge_documents", sa.Column("file_size", sa.Integer))


def downgrade():
    op.drop_column("knowledge_documents", "file_size")
    op.drop_column("knowledge_documents", "file_type")
    op.drop_column("knowledge_documents", "file_url")
