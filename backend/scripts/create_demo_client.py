"""Da de alta la cuenta de acceso del cliente de demostracion y la vincula.

Dos pasos, los mismos que se siguieron con el segundo nutricionista de prueba:
crear el usuario por la Admin API de Supabase (con la clave de servicio) y
escribir el vinculo en client.auth_user_id.

El metadato role='client' es lo que hace que el trigger de alta NO cree una fila
de nutricionista. El script lo comprueba despues de crear, porque es el punto que
distingue los dos roles.

Idempotente: si el usuario ya existe reusa su id y solo reescribe el vinculo.
La contrasena se pasa en DEMO_CLIENT_PASSWORD; si no viene, se genera una y se
imprime (solo cuando el usuario se crea, para no dejarla en el repo).

Uso:
    DEMO_CLIENT_PASSWORD=... python scripts/create_demo_client.py
"""

from __future__ import annotations

import asyncio
import os
import secrets
import sys

import httpx

from app.config import BACKEND_DIR, settings  # noqa: F401  (carga .env.local)
from app.db import connection_pool

NUTRI = "03f06edf-603e-489d-8aed-71bc93f97ef0"
CLIENT_NAME = "Maria Gonzalez"
EMAIL = "maria.client@nutriapp.dev"
FULL_NAME = "Maria Gonzalez"


def _admin_headers(key: str) -> dict[str, str]:
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def _env(*names: str) -> str:
    for name in names:
        value = os.environ.get(name, "")
        if value and "<" not in value:
            return value
    raise RuntimeError(f"Falta en .env.local una de estas variables: {', '.join(names)}")


def find_or_create_user() -> tuple[str, str | None]:
    url = _env("SUPABASE_URL").rstrip("/")
    key = _env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY")
    headers = _admin_headers(key)

    listing = httpx.get(
        f"{url}/auth/v1/admin/users",
        headers=headers,
        params={"page": 1, "per_page": 200},
        timeout=30,
    )
    listing.raise_for_status()
    for user in listing.json().get("users", []):
        if user.get("email") == EMAIL:
            return user["id"], None

    password = os.environ.get("DEMO_CLIENT_PASSWORD") or f"Cliente{secrets.token_hex(6)}!"
    created = httpx.post(
        f"{url}/auth/v1/admin/users",
        headers=headers,
        json={
            "email": EMAIL,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"role": "client", "full_name": FULL_NAME, "locale": "es"},
        },
        timeout=30,
    )
    if created.status_code >= 400:
        raise RuntimeError(f"La Admin API rechazo el alta: {created.status_code} {created.text}")
    return created.json()["id"], password


async def link(user_id: str) -> None:
    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            client_id = await conn.fetchval(
                """
                SELECT id FROM client
                WHERE nutritionist_id = $1 AND full_name_pseudonym = $2
                  AND deleted_at IS NULL
                """,
                NUTRI,
                CLIENT_NAME,
            )
            if client_id is None:
                raise RuntimeError(f"No existe el cliente '{CLIENT_NAME}' del nutri de prueba")

            await conn.execute(
                "UPDATE client SET auth_user_id = $1 WHERE id = $2", user_id, client_id
            )

            is_nutri = await conn.fetchval(
                "SELECT EXISTS (SELECT 1 FROM nutritionist WHERE id = $1)", user_id
            )
            signed = await conn.fetchval(
                """
                SELECT count(*) FROM plan
                WHERE client_id = $1 AND approved_at IS NOT NULL AND deleted_at IS NULL
                """,
                client_id,
            )

    print(f"client id      {client_id}")
    print(f"auth_user_id   {user_id}")
    print(f"planes firmados {signed}")
    if is_nutri:
        print("ERROR: el alta creo una fila de nutricionista para una cuenta de cliente")
        sys.exit(1)
    print("el trigger no creo fila de nutricionista")
    if signed == 0:
        print("AVISO: el cliente no tiene ningun plan firmado, las pantallas saldran vacias")


def main() -> None:
    user_id, password = find_or_create_user()
    if password:
        print(f"usuario creado  {EMAIL}")
        print(f"contrasena      {password}")
    else:
        print(f"usuario ya existia {EMAIL}")
    asyncio.run(link(user_id))


if __name__ == "__main__":
    main()
