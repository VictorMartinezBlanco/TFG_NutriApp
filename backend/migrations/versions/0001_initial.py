"""esquema inicial

Revision ID: 0001_initial
Revises:
"""
from pathlib import Path

from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

_SQL_DIR = Path(__file__).resolve().parent.parent / "sql"


def upgrade() -> None:
    op.execute((_SQL_DIR / "0001_initial.sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS llm_translation, plan_meal_item, plan, diet_constraint,
          external_food_mapping, recipe_ingredient, recipe, food_tag, food_nutrient,
          food, client, nutritionist, unit, meal_type, tag, nutrient CASCADE;
        DROP FUNCTION IF EXISTS set_updated_at CASCADE;
        DROP TYPE IF EXISTS constraint_source, constraint_priority, constraint_operator,
          constraint_type, constraint_scope, food_source, tag_kind CASCADE;
        """
    )
