"""datos iniciales de catálogos

Revision ID: 0002_seed
Revises: 0001_initial
"""
from pathlib import Path

from alembic import op

revision = "0002_seed"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

_SQL_DIR = Path(__file__).resolve().parent.parent / "sql"


def upgrade() -> None:
    op.execute((_SQL_DIR / "0002_seed.sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("TRUNCATE nutrient, tag, meal_type, unit RESTART IDENTITY CASCADE;")
