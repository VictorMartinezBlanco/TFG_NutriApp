"""escritura del cliente: comidas cumplidas, pesos, citas pendientes y policies

Revision ID: 0014_client_writes
Revises: 0013_seed_demo_refresh
"""
from pathlib import Path

from alembic import op

revision = "0014_client_writes"
down_revision = "0013_seed_demo_refresh"
branch_labels = None
depends_on = None

_SQL_DIR = Path(__file__).resolve().parent.parent / "sql"


def upgrade() -> None:
    sql = (_SQL_DIR / "0014_client_writes.sql").read_text(encoding="utf-8")
    op.execute(sql)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.client_cancel_appointment(INTEGER);")
    op.execute("DROP FUNCTION IF EXISTS public.client_mark_thread_read();")
    op.execute("DROP POLICY IF EXISTS p_appointment_client_request ON appointment;")
    op.execute("DROP POLICY IF EXISTS p_message_client_write ON message;")

    # las policies de las dos tablas nuevas se van con ellas
    op.execute("DROP TABLE IF EXISTS weight_entry;")
    op.execute("DROP TABLE IF EXISTS meal_check;")

    # las citas pendientes dejarian de validar el CHECK anterior
    op.execute("UPDATE appointment SET status = 'cancelled' WHERE status = 'pending';")
    op.execute("ALTER TABLE appointment DROP CONSTRAINT IF EXISTS appointment_status_check;")
    op.execute(
        "ALTER TABLE appointment ADD CONSTRAINT appointment_status_check "
        "CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show'));"
    )
