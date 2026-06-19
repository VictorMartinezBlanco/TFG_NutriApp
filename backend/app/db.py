"""Pool de conexiones asyncpg a Supabase.

Se crea un único pool la primera vez que se pide y se reutiliza. Con FastAPI se
abrirá en el lifespan; aquí los scripts lo abren y cierran con connection_pool()
o con get_pool() / close_pool().

Va por el pooler (puerto 6543) porque el host directo solo resuelve por IPv6 en
los proyectos free nuevos y eso falla desde redes sin IPv6. En modo transaction
del pooler hay que poner statement_cache_size=0: cada transaccion puede ir por
una conexion fisica distinta y los prepared statements no sobreviven.

La conexion usa el rol postgres, que es superusuario y se salta la RLS. Es lo
correcto para el backend; el filtrado por auth.uid() lo hace el frontend con la
clave publishable.
"""

from __future__ import annotations

import contextlib
from typing import AsyncIterator, Optional

import asyncpg

from .config import settings

_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    """Devuelve el pool global, creándolo la primera vez."""
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=settings.database_url,
            min_size=1,
            max_size=10,
            # Obligatorio con el pooler en transaction mode (ver docstring).
            statement_cache_size=0,
            command_timeout=30,
        )
    return _pool


async def close_pool() -> None:
    """Cierra el pool global si está abierto. Llamar al apagar."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


@contextlib.asynccontextmanager
async def connection_pool() -> AsyncIterator[asyncpg.Pool]:
    """Context manager que abre el pool y lo cierra al salir.

    Pensado para scripts sueltos:
        async with connection_pool() as pool:
            async with pool.acquire() as conn:
                ...
    """
    pool = await get_pool()
    try:
        yield pool
    finally:
        await close_pool()
