"""amplia el juego de datos de demostracion con seis clientes y sus restricciones

Revision ID: 0015_seed_demo_clients
Revises: 0014_client_writes
"""
from pathlib import Path

from alembic import op

revision = "0015_seed_demo_clients"
down_revision = "0014_client_writes"
branch_labels = None
depends_on = None

_SQL_DIR = Path(__file__).resolve().parent.parent / "sql"


def upgrade() -> None:
    sql = (_SQL_DIR / "0015_seed_demo_clients.sql").read_text(encoding="utf-8")
    op.execute(sql)


def downgrade() -> None:
    # borrar los clientes arrastraria en cascada sus planes, marcas y mensajes.
    # son datos de demostracion, no hay nada que preservar revirtiendo.
    pass
