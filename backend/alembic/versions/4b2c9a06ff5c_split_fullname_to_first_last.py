"""split_fullname_to_first_last

Revision ID: 4b2c9a06ff5c
Revises: eb5e67d6b7b1
Create Date: 2026-04-14 12:44:28.067927

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4b2c9a06ff5c'
down_revision: Union[str, None] = 'eb5e67d6b7b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new columns as nullable first
    op.add_column('users', sa.Column('first_name', sa.String(length=127), server_default='', nullable=False))
    op.add_column('users', sa.Column('last_name', sa.String(length=127), server_default='', nullable=False))

    # Populate from full_name: "Фамилия Имя" → last_name=first word, first_name=rest
    op.execute("""
        UPDATE users SET
            first_name = CASE
                WHEN position(' ' in full_name) > 0
                THEN substring(full_name from position(' ' in full_name) + 1)
                ELSE full_name
            END,
            last_name = CASE
                WHEN position(' ' in full_name) > 0
                THEN substring(full_name from 1 for position(' ' in full_name) - 1)
                ELSE ''
            END
    """)

    op.drop_column('users', 'full_name')


def downgrade() -> None:
    op.add_column('users', sa.Column('full_name', sa.VARCHAR(length=255), server_default='', nullable=False))
    op.execute("UPDATE users SET full_name = trim(first_name || ' ' || last_name)")
    op.drop_column('users', 'last_name')
    op.drop_column('users', 'first_name')
