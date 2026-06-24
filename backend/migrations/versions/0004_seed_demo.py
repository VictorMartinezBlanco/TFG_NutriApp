"""datos de demostracion del nutri de prueba

Revision ID: 0004_seed_demo
Revises: 0003_auth_trigger
"""
from pathlib import Path

from alembic import op

revision = "0004_seed_demo"
down_revision = "0003_auth_trigger"
branch_labels = None
depends_on = None

_SQL_DIR = Path(__file__).resolve().parent.parent / "sql"

_NUTRI = "03f06edf-603e-489d-8aed-71bc93f97ef0"


def upgrade() -> None:
    op.execute((_SQL_DIR / "0004_seed_demo.sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute(
        f"""
        DELETE FROM plan   WHERE nutritionist_id = '{_NUTRI}';
        DELETE FROM client WHERE nutritionist_id = '{_NUTRI}';
        """
    )
