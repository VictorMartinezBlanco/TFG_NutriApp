"""deja la actividad de la demostracion llena y vigente para un periodo de evaluacion

Se aplica despues de 0017, que empuja los planes viejos al pasado.

Revision ID: 0019_seed_demo_activity
Revises: 0018_food_serving_profile
"""
from pathlib import Path

from alembic import op

revision = "0019_seed_demo_activity"
down_revision = "0018_food_serving_profile"
branch_labels = None
depends_on = None

_SQL_DIR = Path(__file__).resolve().parent.parent / "sql"


def upgrade() -> None:
    sql = (_SQL_DIR / "0019_seed_demo_activity.sql").read_text(encoding="utf-8")
    op.execute(sql)


def downgrade() -> None:
    # solo reescribe datos de demostracion fechados: no hay nada que revertir.
    pass
