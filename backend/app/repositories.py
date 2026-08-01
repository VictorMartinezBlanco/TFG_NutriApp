"""Acceso a datos.

Lecturas y escrituras mínimas: leer catálogos, dar de alta alimentos con su
composición y sus tags, y leer un alimento completo (con nutrientes y tags) para
comprobar que la cadena de FKs funciona. El resto de tablas se irán cubriendo
cuando hagan falta.

Las funciones reciben la conexión (conn) en vez de abrirla ellas, para poder
encadenarlas dentro de la misma transacción.
"""

from __future__ import annotations

from typing import Any, Optional

import asyncpg

# ---------------------------------------------------------------------------
# Lectura de catálogos
# ---------------------------------------------------------------------------


async def count_catalogs(conn: asyncpg.Connection) -> dict[str, int]:
    """Conteo por catálogo. Útil como smoke test (esperado 12/20/6/7)."""
    row = await conn.fetchrow(
        """
        SELECT
          (SELECT count(*) FROM nutrient)  AS nutrient,
          (SELECT count(*) FROM tag)       AS tag,
          (SELECT count(*) FROM meal_type) AS meal_type,
          (SELECT count(*) FROM unit)      AS unit
        """
    )
    return dict(row)


async def nutrient_id_by_code(conn: asyncpg.Connection) -> dict[str, int]:
    """Mapa code -> id de todos los nutrientes. Para resolver el seed por código."""
    rows = await conn.fetch("SELECT code, id FROM nutrient")
    return {r["code"]: r["id"] for r in rows}


async def tag_id_by_code(conn: asyncpg.Connection) -> dict[str, int]:
    """Mapa code -> id de todos los tags."""
    rows = await conn.fetch("SELECT code, id FROM tag")
    return {r["code"]: r["id"] for r in rows}


# ---------------------------------------------------------------------------
# Alta de alimentos (food + food_nutrient + food_tag)
# ---------------------------------------------------------------------------


async def upsert_food(
    conn: asyncpg.Connection,
    *,
    name_es: str,
    name_en: str,
    source: str = "custom",
    source_id: Optional[str] = None,
    typical_serving_g: Optional[float] = None,
    density_g_ml: Optional[float] = None,
    nutritionist_id: Optional[str] = None,
) -> int:
    """Inserta (o reutiliza) un alimento global y devuelve su id.

    Idempotencia: como `food` no tiene clave natural única en el esquema, usamos
    (name_es, source, nutritionist_id IS NULL) como identidad lógica del catálogo
    global. Si ya existe un alimento global vivo con ese name_es y source, se
    reutiliza en vez de duplicar. Esto hace el script de carga re-ejecutable.
    """
    existing = await conn.fetchval(
        """
        SELECT id FROM food
        WHERE name_es = $1 AND source = $2::food_source
          AND nutritionist_id IS NOT DISTINCT FROM $3
          AND deleted_at IS NULL
        LIMIT 1
        """,
        name_es,
        source,
        nutritionist_id,
    )
    if existing is not None:
        return existing

    return await conn.fetchval(
        """
        INSERT INTO food (name_es, name_en, source, source_id,
                          typical_serving_g, density_g_ml, nutritionist_id)
        VALUES ($1, $2, $3::food_source, $4, $5, $6, $7)
        RETURNING id
        """,
        name_es,
        name_en,
        source,
        source_id,
        typical_serving_g,
        density_g_ml,
        nutritionist_id,
    )


async def set_food_nutrients(
    conn: asyncpg.Connection,
    food_id: int,
    values_per_100g: dict[int, float],
) -> int:
    """Establece la composición (EAV, por 100 g) de un alimento.

    `values_per_100g` mapea nutrient_id -> valor. UPSERT sobre la PK compuesta
    (food_id, nutrient_id), así re-cargar actualiza valores sin duplicar filas.
    Devuelve el número de nutrientes escritos.
    """
    if not values_per_100g:
        return 0
    await conn.executemany(
        """
        INSERT INTO food_nutrient (food_id, nutrient_id, value_per_100g)
        VALUES ($1, $2, $3)
        ON CONFLICT (food_id, nutrient_id)
        DO UPDATE SET value_per_100g = EXCLUDED.value_per_100g
        """,
        [(food_id, nid, val) for nid, val in values_per_100g.items()],
    )
    return len(values_per_100g)


async def set_food_serving_profile(
    conn: asyncpg.Connection,
    food_id: int,
    *,
    min_serving_g: Optional[float],
    max_serving_g: Optional[float],
    grams_per_unit: Optional[float],
) -> None:
    """Escribe el perfil de ración de un alimento (Bloque 8e).

    Va aparte de upsert_food porque el upsert reutiliza filas existentes sin
    tocarlas; el perfil sí debe actualizarse al recargar el seed.
    """
    await conn.execute(
        """
        UPDATE food
        SET min_serving_g = $2, max_serving_g = $3, grams_per_unit = $4
        WHERE id = $1
        """,
        food_id,
        min_serving_g,
        max_serving_g,
        grams_per_unit,
    )


async def set_food_tags(
    conn: asyncpg.Connection,
    food_id: int,
    tag_ids: list[int],
) -> int:
    """Asocia tags a un alimento (N:M). Idempotente vía ON CONFLICT DO NOTHING."""
    if not tag_ids:
        return 0
    await conn.executemany(
        """
        INSERT INTO food_tag (food_id, tag_id)
        VALUES ($1, $2)
        ON CONFLICT (food_id, tag_id) DO NOTHING
        """,
        [(food_id, tid) for tid in tag_ids],
    )
    return len(tag_ids)


# ---------------------------------------------------------------------------
# Lectura cruzada (verificación end-to-end de FKs)
# ---------------------------------------------------------------------------


async def get_food_full(conn: asyncpg.Connection, food_id: int) -> Optional[dict[str, Any]]:
    """Devuelve un alimento con sus nutrientes y tags resueltos por código.

    Sirve de prueba real de que food → food_nutrient → nutrient y
    food → food_tag → tag están bien enlazados.
    """
    food = await conn.fetchrow(
        "SELECT id, name_es, name_en, source, typical_serving_g FROM food WHERE id = $1",
        food_id,
    )
    if food is None:
        return None

    nutrients = await conn.fetch(
        """
        SELECT n.code, n.name_es, n.unit_default, fn.value_per_100g
        FROM food_nutrient fn
        JOIN nutrient n ON n.id = fn.nutrient_id
        WHERE fn.food_id = $1
        ORDER BY n.tier, n.id
        """,
        food_id,
    )
    tags = await conn.fetch(
        """
        SELECT t.code, t.kind
        FROM food_tag ft
        JOIN tag t ON t.id = ft.tag_id
        WHERE ft.food_id = $1
        ORDER BY t.kind, t.code
        """,
        food_id,
    )
    return {
        **dict(food),
        "nutrients": [dict(r) for r in nutrients],
        "tags": [dict(r) for r in tags],
    }


async def list_foods(
    conn: asyncpg.Connection,
    *,
    only_global: bool = True,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Lista alimentos vivos con su nº de nutrientes y tags. Para verificación."""
    where = "f.deleted_at IS NULL"
    if only_global:
        where += " AND f.nutritionist_id IS NULL"
    rows = await conn.fetch(
        f"""
        SELECT f.id, f.name_es, f.source,
               (SELECT count(*) FROM food_nutrient fn WHERE fn.food_id = f.id) AS n_nutrients,
               (SELECT count(*) FROM food_tag ft WHERE ft.food_id = f.id)      AS n_tags
        FROM food f
        WHERE {where}
        ORDER BY f.name_es
        LIMIT $1
        """,
        limit,
    )
    return [dict(r) for r in rows]
