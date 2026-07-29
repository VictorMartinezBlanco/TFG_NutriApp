"""estilo clinico de demostracion, en ambito nutricionista (vive en el 2o nutri)

Revision ID: 0016_seed_clinical_style
Revises: 0015_seed_demo_clients
"""
from pathlib import Path

from alembic import op

revision = "0016_seed_clinical_style"
down_revision = "0015_seed_demo_clients"
branch_labels = None
depends_on = None

_SQL_DIR = Path(__file__).resolve().parent.parent / "sql"


def upgrade() -> None:
    sql = (_SQL_DIR / "0016_seed_clinical_style.sql").read_text(encoding="utf-8")
    op.execute(sql)


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM diet_constraint dc
         USING nutritionist n
         WHERE dc.scope_type = 'nutritionist'
           AND dc.scope_nutritionist_id = n.id
           AND n.full_name = 'Dr. Second Tester'
        """
    )
