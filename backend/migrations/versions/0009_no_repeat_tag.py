"""anade no_repeat_tag al enum y el tag red_meat

Revision ID: 0009_no_repeat_tag
Revises: 0008_seed_calendar_messages
"""
from pathlib import Path

from alembic import op

revision = "0009_no_repeat_tag"
down_revision = "0008_seed_calendar_messages"
branch_labels = None
depends_on = None

_SQL_DIR = Path(__file__).resolve().parent.parent / "sql"


def upgrade() -> None:
    sql = (_SQL_DIR / "0009_no_repeat_tag.sql").read_text(encoding="utf-8")
    add_value, rest = sql.split("--@split", 1)
    # ADD VALUE no puede ir dentro de la transaccion que envuelve la migracion.
    with op.get_context().autocommit_block():
        op.execute(add_value)
    op.execute(rest)


def downgrade() -> None:
    # Postgres no permite quitar un valor de un enum sin recrear el tipo y
    # reescribir todas las columnas que lo usan, asi que el downgrade solo
    # revierte el CHECK y el tag. El valor no_repeat_tag queda en el enum.
    op.execute("DELETE FROM tag WHERE code = 'red_meat';")
    op.execute("ALTER TABLE diet_constraint DROP CONSTRAINT chk_constraint_target;")
    op.execute(
        """
        ALTER TABLE diet_constraint ADD CONSTRAINT chk_constraint_target CHECK (
          CASE type
            WHEN 'forbid_food'    THEN target_food_id IS NOT NULL
            WHEN 'prefer_food'    THEN target_food_id IS NOT NULL
            WHEN 'no_repeat_food' THEN target_food_id IS NOT NULL
            WHEN 'forbid_tag'     THEN target_tag_id IS NOT NULL
            WHEN 'prefer_tag'     THEN target_tag_id IS NOT NULL
            WHEN 'nutrient_min'   THEN target_nutrient_id IS NOT NULL
            WHEN 'nutrient_max'   THEN target_nutrient_id IS NOT NULL
            WHEN 'nutrient_ratio' THEN target_nutrient_id IS NOT NULL
            ELSE TRUE
          END
        );
        """
    )
