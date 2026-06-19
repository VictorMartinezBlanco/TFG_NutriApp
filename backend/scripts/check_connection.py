"""Smoke test de la conexión al backend.

Verifica que asyncpg conecta a Supabase, que está abierta la BD correcta y que
los catálogos del seed están cargados (12 nutrientes, 20 tags, 6 meal_types,
7 units). No escribe nada.

Uso (desde Repo/backend, con el venv activo):
    python -m scripts.check_connection
"""

from __future__ import annotations

import asyncio

from app.config import settings
from app.db import connection_pool
from app.repositories import count_catalogs

EXPECTED = {"nutrient": 12, "tag": 20, "meal_type": 6, "unit": 7}


async def main() -> int:
    print(f"Conectando vía {'POOLER' if settings.using_pooler else 'DIRECTO'} ...")
    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            version = await conn.fetchval("SELECT version()")
            dbname = await conn.fetchval("SELECT current_database()")
            counts = await count_catalogs(conn)

    print(f"  Postgres : {version.split(',')[0]}")
    print(f"  Base     : {dbname}")
    print(f"  Catálogos: {counts}")

    ok = counts == EXPECTED
    if ok:
        print("OK: conexion y catalogos correctos.")
        return 0
    print(f"AVISO: los catalogos no coinciden con lo esperado {EXPECTED}.")
    return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
