"""Lectura de las entradas del solver desde la base de datos.

Carga el perfil del cliente, sus restricciones activas (ambito cliente mas las de
ambito nutricionista del profesional) y el catalogo de alimentos visible con su
composicion pivotada por code de nutriente y sus tags. El backend usa el rol
postgres, que se salta la RLS: el aislamiento por nutri lo garantiza el llamante,
que solo pasa ids propios.
"""

from __future__ import annotations

from datetime import date
from typing import Optional

import asyncpg

from .types import ClientProfile, Constraint, Food


def _age_from_birth(birth: Optional[date], today: date) -> Optional[int]:
    if birth is None:
        return None
    years = today.year - birth.year
    if (today.month, today.day) < (birth.month, birth.day):
        years -= 1
    return years


async def load_client(
    conn: asyncpg.Connection, client_id: int, *, today: Optional[date] = None
) -> Optional[ClientProfile]:
    row = await conn.fetchrow(
        """
        SELECT id, sex, birth_date, height_cm, weight_kg, activity_level
        FROM client
        WHERE id = $1 AND deleted_at IS NULL
        """,
        client_id,
    )
    if row is None:
        return None
    ref = today or date.today()
    return ClientProfile(
        id=row["id"],
        sex=row["sex"],
        age=_age_from_birth(row["birth_date"], ref),
        height_cm=float(row["height_cm"]) if row["height_cm"] is not None else None,
        weight_kg=float(row["weight_kg"]) if row["weight_kg"] is not None else None,
        activity_level=row["activity_level"],
    )


async def load_constraints(
    conn: asyncpg.Connection, client_id: int, nutritionist_id: Optional[str]
) -> list[Constraint]:
    """Restricciones activas del cliente mas las de estilo del nutricionista."""
    rows = await conn.fetch(
        """
        SELECT id, type::text AS type, priority::text AS priority, weight,
               operator::text AS operator, value, value2,
               target_food_id, target_tag_id, target_nutrient_id, context
        FROM diet_constraint
        WHERE deleted_at IS NULL
          AND (
            (scope_type = 'client' AND scope_client_id = $1)
            OR (scope_type = 'nutritionist' AND scope_nutritionist_id = $2)
          )
        ORDER BY id
        """,
        client_id,
        nutritionist_id,
    )
    out: list[Constraint] = []
    for r in rows:
        ctx = r["context"]
        if isinstance(ctx, str):
            import json

            ctx = json.loads(ctx)
        out.append(
            Constraint(
                id=r["id"],
                type=r["type"],
                priority=r["priority"],
                weight=r["weight"],
                operator=r["operator"],
                value=float(r["value"]) if r["value"] is not None else None,
                value2=float(r["value2"]) if r["value2"] is not None else None,
                target_food_id=r["target_food_id"],
                target_tag_id=r["target_tag_id"],
                target_nutrient_id=r["target_nutrient_id"],
                context=ctx or {},
            )
        )
    return out


async def load_food_pool(
    conn: asyncpg.Connection, nutritionist_id: Optional[str]
) -> list[Food]:
    """Alimentos globales mas los del nutricionista, con nutrientes y tags."""
    foods = await conn.fetch(
        """
        SELECT id, name_en, typical_serving_g,
               min_serving_g, max_serving_g, grams_per_unit
        FROM food
        WHERE deleted_at IS NULL
          AND (nutritionist_id IS NULL OR nutritionist_id = $1)
        ORDER BY id
        """,
        nutritionist_id,
    )
    ids = [f["id"] for f in foods]
    if not ids:
        return []

    nut_rows = await conn.fetch(
        """
        SELECT fn.food_id, n.code, fn.value_per_100g
        FROM food_nutrient fn
        JOIN nutrient n ON n.id = fn.nutrient_id
        WHERE fn.food_id = ANY($1::int[])
        """,
        ids,
    )
    tag_rows = await conn.fetch(
        """
        SELECT ft.food_id, ft.tag_id, t.code
        FROM food_tag ft JOIN tag t ON t.id = ft.tag_id
        WHERE ft.food_id = ANY($1::int[])
        """,
        ids,
    )

    by_food_nut: dict[int, dict[str, float]] = {i: {} for i in ids}
    for r in nut_rows:
        by_food_nut[r["food_id"]][r["code"]] = float(r["value_per_100g"])
    by_food_tag: dict[int, set[int]] = {i: set() for i in ids}
    by_food_code: dict[int, set[str]] = {i: set() for i in ids}
    for r in tag_rows:
        by_food_tag[r["food_id"]].add(r["tag_id"])
        by_food_code[r["food_id"]].add(r["code"])

    def _f(value) -> Optional[float]:
        return float(value) if value is not None else None

    return [
        Food(
            id=f["id"],
            name=f["name_en"],
            typical_serving_g=_f(f["typical_serving_g"]),
            min_serving_g=_f(f["min_serving_g"]),
            max_serving_g=_f(f["max_serving_g"]),
            grams_per_unit=_f(f["grams_per_unit"]),
            nutrients=by_food_nut[f["id"]],
            tag_ids=by_food_tag[f["id"]],
            tag_codes=by_food_code[f["id"]],
        )
        for f in foods
    ]


# franjas que usa un plan segun sus comidas al dia. Coger "las primeras N por
# default_order" dejaba un plan de 3 comidas en desayuno/media manana/comida,
# sin cena; las principales entran primero y los tentempies se anaden despues.
_SLOTS_BY_COUNT = {
    1: ["lunch"],
    2: ["lunch", "dinner"],
    3: ["breakfast", "lunch", "dinner"],
    4: ["breakfast", "lunch", "snack", "dinner"],
    5: ["breakfast", "mid_morning", "lunch", "snack", "dinner"],
    6: ["breakfast", "mid_morning", "lunch", "snack", "dinner", "late_snack"],
}


async def load_meal_type_codes(conn: asyncpg.Connection, meals_per_day: int) -> list[str]:
    """Las franjas del plan, en orden cronologico (default_order)."""
    codes = _SLOTS_BY_COUNT.get(meals_per_day)
    if codes is None:
        rows = await conn.fetch(
            "SELECT code FROM meal_type ORDER BY default_order LIMIT $1", meals_per_day
        )
        return [r["code"] for r in rows]
    rows = await conn.fetch(
        "SELECT code FROM meal_type WHERE code = ANY($1::text[]) ORDER BY default_order",
        codes,
    )
    return [r["code"] for r in rows]
