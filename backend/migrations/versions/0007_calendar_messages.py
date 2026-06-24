"""calendario, disponibilidad y mensajeria del nutri

Revision ID: 0007_calendar_messages
Revises: 0006_seed_plans
"""
from pathlib import Path

from alembic import op

revision = "0007_calendar_messages"
down_revision = "0006_seed_plans"
branch_labels = None
depends_on = None

_SQL_DIR = Path(__file__).resolve().parent.parent / "sql"


def upgrade() -> None:
    op.execute((_SQL_DIR / "0007_calendar_messages.sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS message, availability, appointment CASCADE;")
