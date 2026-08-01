"""anade el perfil de racion por alimento y los tags de rol y momento

Tres columnas en food (min_serving_g, max_serving_g, grams_per_unit), los
tags de rol condiment y sweet, y el kind meal_moment con un tag por franja.

Revision ID: 0018_food_serving_profile
Revises: 0017_seed_demo_refresh
"""
from pathlib import Path

from alembic import op

revision = "0018_food_serving_profile"
down_revision = "0017_seed_demo_refresh"
branch_labels = None
depends_on = None

_SQL_DIR = Path(__file__).resolve().parent.parent / "sql"


def upgrade() -> None:
    sql = (_SQL_DIR / "0018_food_serving_profile.sql").read_text(encoding="utf-8")
    add_value, rest = sql.split("--@split", 1)
    # ADD VALUE no puede ir dentro de la transaccion que envuelve la migracion.
    with op.get_context().autocommit_block():
        op.execute(add_value)
    op.execute(rest)


def downgrade() -> None:
    # Como en la 0009: el valor meal_moment queda en el enum (quitarlo exige
    # recrear el tipo); se revierte todo lo demas.
    op.execute(
        "DELETE FROM tag WHERE code IN ('condiment', 'sweet') "
        "OR kind = 'meal_moment';"
    )
    op.execute("ALTER TABLE food DROP CONSTRAINT IF EXISTS chk_food_serving_profile;")
    op.execute(
        "ALTER TABLE food DROP COLUMN IF EXISTS min_serving_g, "
        "DROP COLUMN IF EXISTS max_serving_g, "
        "DROP COLUMN IF EXISTS grams_per_unit;"
    )
