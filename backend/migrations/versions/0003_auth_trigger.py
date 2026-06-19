"""trigger de alta del nutricionista

Revision ID: 0003_auth_trigger
Revises: 0002_seed
"""
from pathlib import Path

from alembic import op

revision = "0003_auth_trigger"
down_revision = "0002_seed"
branch_labels = None
depends_on = None

_SQL_DIR = Path(__file__).resolve().parent.parent / "sql"


def upgrade() -> None:
    op.execute((_SQL_DIR / "0003_auth_trigger.sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
        DROP FUNCTION IF EXISTS public.handle_new_auth_user CASCADE;
        """
    )
