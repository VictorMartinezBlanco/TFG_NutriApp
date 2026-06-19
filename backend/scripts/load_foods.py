"""Carga el subset inicial de alimentos en el catálogo global.

Inserta los ~22 alimentos de app/seed_foods.py con su composición (12 nutrientes
T1) y sus tags, todos como alimentos globales (nutritionist_id IS NULL). Es
**idempotente**: re-ejecutarlo no duplica (reutiliza el food por name_es+source,
hace UPSERT de nutrientes y DO NOTHING en tags).

Toda la carga va en una única transacción: o entra todo o no entra nada.

Conexión por el rol `postgres` (superusuario Supabase) → bypassa RLS, que es lo
correcto para una carga de catálogo de confianza.

Uso (desde Repo/backend, con el venv activo):
    python -m scripts.load_foods
"""

from __future__ import annotations

import asyncio

from app.db import connection_pool
from app.repositories import (
    get_food_full,
    list_foods,
    nutrient_id_by_code,
    set_food_nutrients,
    set_food_tags,
    tag_id_by_code,
    upsert_food,
)
from app.seed_foods import FOODS


async def main() -> int:
    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            # Resolver códigos → ids una sola vez.
            n_map = await nutrient_id_by_code(conn)
            t_map = await tag_id_by_code(conn)

            # Validación temprana: detecta códigos del seed que no existan en BD
            # antes de escribir nada (mejor fallar claro que con FK violation).
            for food in FOODS:
                for code in food["nutrients"]:
                    if code not in n_map:
                        raise SystemExit(f"Nutriente desconocido en seed: '{code}'")
                for code in food["tags"]:
                    if code not in t_map:
                        raise SystemExit(f"Tag desconocido en seed: '{code}'")

            inserted_ids: list[int] = []
            async with conn.transaction():
                for food in FOODS:
                    food_id = await upsert_food(
                        conn,
                        name_es=food["name_es"],
                        name_en=food["name_en"],
                        source="custom",
                        typical_serving_g=food.get("typical_serving_g"),
                        nutritionist_id=None,  # catálogo global
                    )
                    await set_food_nutrients(
                        conn,
                        food_id,
                        {n_map[code]: val for code, val in food["nutrients"].items()},
                    )
                    await set_food_tags(
                        conn,
                        food_id,
                        [t_map[code] for code in food["tags"]],
                    )
                    inserted_ids.append(food_id)

            # Verificación dentro de la misma sesión.
            foods = await list_foods(conn, only_global=True, limit=200)
            print(f"Alimentos globales tras la carga: {len(foods)}")
            for f in foods:
                print(f"  #{f['id']:>3} {f['name_es']:<38} "
                      f"nutr={f['n_nutrients']:>2} tags={f['n_tags']:>2}")

            # Muestra detallada de uno para confirmar la cadena de joins.
            sample = await get_food_full(conn, inserted_ids[0])
            print("\nDetalle de verificación:")
            print(f"  {sample['name_es']} ({sample['name_en']})")
            print("  Nutrientes/100g:",
                  ", ".join(f"{n['code']}={n['value_per_100g']}" for n in sample["nutrients"]))
            print("  Tags:", ", ".join(f"{t['code']}" for t in sample["tags"]))

    print("\nOK: alimentos cargados y verificados.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
