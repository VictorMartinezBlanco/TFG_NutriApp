"""Carga de configuración desde .env.local.

Una sola fuente de verdad para los parámetros de conexión. El resto del backend
importa `settings` de aquí en lugar de leer os.environ directamente, así si
mañana cambia el origen (variables del sistema, secrets manager) se toca un
único sitio.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# .env.local vive en la raíz de backend/ (un nivel por encima de app/).
BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env.local")


@dataclass(frozen=True)
class Settings:
    """Parámetros de conexión a Supabase/Postgres.

    `database_url` resuelve la mejor cadena disponible para asyncpg:
    prioriza el pooler (IPv4, recomendado para runtime) y cae al directo.
    asyncpg no entiende el prefijo SQLAlchemy `postgresql+asyncpg://`, así que
    se normaliza a `postgresql://` antes de devolverlo.
    """

    database_url: str
    using_pooler: bool
    # secreto compartido con el frontend para autenticar sus llamadas a la API.
    # vacio en los scripts que solo tocan la BD (solver, validador).
    api_token: str
    # motor del traductor de restricciones. Ollama corre local y no lleva clave.
    ollama_host: str
    ollama_model: str

    @staticmethod
    def _normalize(dsn: str) -> str:
        # asyncpg quiere postgresql://, no el dialecto SQLAlchemy postgresql+asyncpg://.
        return dsn.replace("postgresql+asyncpg://", "postgresql://", 1)

    @classmethod
    def load(cls) -> "Settings":
        pooler = os.environ.get("DATABASE_URL_POOLER")
        direct = os.environ.get("DATABASE_URL_ASYNCPG") or os.environ.get("DATABASE_URL")
        token = os.environ.get("NUTRIAPP_API_TOKEN", "")
        ollama_host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
        ollama_model = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b-instruct")

        if pooler and "<" not in pooler:  # rellenado de verdad, no la plantilla
            return cls(
                database_url=cls._normalize(pooler), using_pooler=True, api_token=token,
                ollama_host=ollama_host, ollama_model=ollama_model,
            )
        if direct and "<" not in direct:
            return cls(
                database_url=cls._normalize(direct), using_pooler=False, api_token=token,
                ollama_host=ollama_host, ollama_model=ollama_model,
            )

        raise RuntimeError(
            "No hay cadena de conexión utilizable en .env.local. "
            "Rellena DATABASE_URL_POOLER (recomendado) o DATABASE_URL_ASYNCPG."
        )


settings = Settings.load()
