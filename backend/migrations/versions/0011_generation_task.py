"""cola de generacion de planes

Revision ID: 0011_generation_task
Revises: 0010_food_family_tags
"""
from pathlib import Path

from alembic import op

revision = "0011_generation_task"
down_revision = "0010_food_family_tags"
branch_labels = None
depends_on = None

_SQL_DIR = Path(__file__).resolve().parent.parent / "sql"


def upgrade() -> None:
    sql = (_SQL_DIR / "0011_generation_task.sql").read_text(encoding="utf-8")
    op.execute(sql)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS generation_task;")
