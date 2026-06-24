"""datos demo de calendario y mensajeria

Revision ID: 0008_seed_calendar_messages
Revises: 0007_calendar_messages
"""
from pathlib import Path

from alembic import op

revision = "0008_seed_calendar_messages"
down_revision = "0007_calendar_messages"
branch_labels = None
depends_on = None

_SQL_DIR = Path(__file__).resolve().parent.parent / "sql"

_NUTRI = "03f06edf-603e-489d-8aed-71bc93f97ef0"


def upgrade() -> None:
    op.execute((_SQL_DIR / "0008_seed_calendar_messages.sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute(f"DELETE FROM message      WHERE nutritionist_id = '{_NUTRI}';")
    op.execute(f"DELETE FROM appointment  WHERE nutritionist_id = '{_NUTRI}';")
    op.execute(f"DELETE FROM availability WHERE nutritionist_id = '{_NUTRI}';")
