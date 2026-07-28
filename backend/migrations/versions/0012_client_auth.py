"""acceso del cliente: vinculo con auth, alta por rol y policies de lectura

Revision ID: 0012_client_auth
Revises: 0011_generation_task
"""
from pathlib import Path

from alembic import op

revision = "0012_client_auth"
down_revision = "0011_generation_task"
branch_labels = None
depends_on = None

_SQL_DIR = Path(__file__).resolve().parent.parent / "sql"


def upgrade() -> None:
    sql = (_SQL_DIR / "0012_client_auth.sql").read_text(encoding="utf-8")
    op.execute(sql)


def downgrade() -> None:
    for table, policy in [
        ("food_nutrient", "p_fn_client_read"),
        ("food", "p_food_client_read"),
        ("availability", "p_availability_client_read"),
        ("appointment", "p_appointment_client_read"),
        ("message", "p_message_client_read"),
        ("plan_meal_item", "p_pmi_client_read"),
        ("plan", "p_plan_client_read"),
        ("nutritionist", "p_nutri_client_read"),
        ("client", "p_client_self_read"),
    ]:
        op.execute(f"DROP POLICY IF EXISTS {policy} ON {table};")

    op.execute("DROP FUNCTION IF EXISTS public.current_client_nutritionist_id();")
    op.execute("DROP FUNCTION IF EXISTS public.current_client_id();")
    op.execute("ALTER TABLE client DROP COLUMN IF EXISTS auth_user_id;")

    # el trigger de alta vuelve a la version de 0003, sin la rama de rol
    op.execute((_SQL_DIR / "0003_auth_trigger.sql").read_text(encoding="utf-8"))
