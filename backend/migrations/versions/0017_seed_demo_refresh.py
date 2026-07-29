"""reancla al dia de hoy todo el juego de datos de demostracion fechado

Sucede a 0013, que solo cubria cuatro clientes y una serie de pesos.

Revision ID: 0017_seed_demo_refresh
Revises: 0016_seed_clinical_style
"""
from pathlib import Path

from alembic import op

revision = "0017_seed_demo_refresh"
down_revision = "0016_seed_clinical_style"
branch_labels = None
depends_on = None

_SQL_DIR = Path(__file__).resolve().parent.parent / "sql"


def upgrade() -> None:
    sql = (_SQL_DIR / "0017_seed_demo_refresh.sql").read_text(encoding="utf-8")
    op.execute(sql)


def downgrade() -> None:
    # solo reescribe datos de demostracion fechados: no hay nada que revertir.
    pass
