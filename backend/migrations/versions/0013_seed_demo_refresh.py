"""reancla al dia de hoy las fechas del juego de datos de demostracion

Revision ID: 0013_seed_demo_refresh
Revises: 0012_client_auth
"""
from pathlib import Path

from alembic import op

revision = "0013_seed_demo_refresh"
down_revision = "0012_client_auth"
branch_labels = None
depends_on = None

_SQL_DIR = Path(__file__).resolve().parent.parent / "sql"


def upgrade() -> None:
    sql = (_SQL_DIR / "0013_seed_demo_refresh.sql").read_text(encoding="utf-8")
    op.execute(sql)


def downgrade() -> None:
    # solo mueve fechas de datos de demostracion: no hay nada que revertir, y
    # volver a las de junio de 2026 no tendria valor.
    pass
