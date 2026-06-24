"""planes de demostracion con sus comidas

Revision ID: 0006_seed_plans
Revises: 0005_seed_constraints
"""
from pathlib import Path

from alembic import op

revision = "0006_seed_plans"
down_revision = "0005_seed_constraints"
branch_labels = None
depends_on = None

_SQL_DIR = Path(__file__).resolve().parent.parent / "sql"

_NUTRI = "03f06edf-603e-489d-8aed-71bc93f97ef0"


def upgrade() -> None:
    op.execute((_SQL_DIR / "0006_seed_plans.sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute(f"DELETE FROM plan WHERE nutritionist_id = '{_NUTRI}';")
