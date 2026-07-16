"""anade tags de familia de alimento

Revision ID: 0010_food_family_tags
Revises: 0009_no_repeat_tag
"""
from pathlib import Path

from alembic import op

revision = "0010_food_family_tags"
down_revision = "0009_no_repeat_tag"
branch_labels = None
depends_on = None

_SQL_DIR = Path(__file__).resolve().parent.parent / "sql"


def upgrade() -> None:
    sql = (_SQL_DIR / "0010_food_family_tags.sql").read_text(encoding="utf-8")
    op.execute(sql)


def downgrade() -> None:
    op.execute(
        "DELETE FROM tag WHERE code IN "
        "('vegetable', 'fruit', 'cereal', 'legume', 'dairy', 'protein_source');"
    )
