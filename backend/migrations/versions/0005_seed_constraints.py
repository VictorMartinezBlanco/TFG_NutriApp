"""restricciones de demostracion de los clientes

Revision ID: 0005_seed_constraints
Revises: 0004_seed_demo
"""
from pathlib import Path

from alembic import op

revision = "0005_seed_constraints"
down_revision = "0004_seed_demo"
branch_labels = None
depends_on = None

_SQL_DIR = Path(__file__).resolve().parent.parent / "sql"

_NUTRI = "03f06edf-603e-489d-8aed-71bc93f97ef0"


def upgrade() -> None:
    op.execute((_SQL_DIR / "0005_seed_constraints.sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute(
        f"""
        DELETE FROM diet_constraint
         WHERE scope_type = 'client'
           AND scope_client_id IN (
             SELECT id FROM client WHERE nutritionist_id = '{_NUTRI}'
           );
        """
    )
