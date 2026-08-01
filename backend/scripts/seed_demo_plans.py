"""Genera con el pipeline real los planes del juego de datos de demostracion.

Los planes de la demostracion no se escriben a mano: se piden al mismo camino
que usan el endpoint y el worker (`run_generation`), asi que cada uno respeta de
verdad las restricciones de su cliente. De paso, doce solves seguidos con
restricciones variadas son una prueba de esfuerzo del catalogo.

Idempotente por objetivo, no por borrado: cada cliente tiene un numero de planes
que deberia tener, y solo se generan los que falten. Volver a ejecutarlo no
duplica nada y no toca los planes existentes. Maria pide dos porque su plan del
seed 0006 se queda como historico y el generado pasa a ser el vigente.

Los planes nacen empezando hoy (`persist_plan` usa la fecha del dia). El refresh
0017 les reparte los start_date, asi que este script se ejecuta ANTES.

Uso (desde Repo/backend, con el venv activo):
    python -m scripts.seed_demo_plans
    python -m scripts.seed_demo_plans --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import time

from app.api import persistence, service
from app.db import connection_pool

NUTRI1 = "03f06edf-603e-489d-8aed-71bc93f97ef0"
NUTRI2_NAME = "Dr. Second Tester"

DURATION_DAYS = 7
# 4 comidas: el defecto del producto desde el 8e (desayuno, comida, merienda,
# cena). Para un objetivo calorico alto el profesional sube las comidas.
MEALS_PER_DAY = 4

# (cliente, planes que deberia tener, firmar el que se genere)
# Michael y Nadia no aparecen: se quedan sin plan a proposito.
TARGETS = [
    ("Maria Gonzalez", 1, 2, True),
    ("Lucia Fernandez", 1, 1, True),
    ("David Romero", 1, 1, True),
    ("Sofia Marin", 1, 1, True),
    ("Carlos Ruiz", 1, 1, True),
    ("Tomas Alvarez", 1, 1, False),
    ("Second Tester Client", 2, 1, True),
    ("Alba Nieto", 2, 1, True),
    ("Hugo Ferrer", 2, 1, False),
]


async def _nutri_ids(conn) -> dict[int, str]:
    second = await conn.fetchval(
        "SELECT id FROM nutritionist WHERE full_name = $1", NUTRI2_NAME
    )
    return {1: NUTRI1, 2: str(second) if second else ""}


async def _client(conn, nutri_id: str, name: str):
    return await conn.fetchrow(
        """
        SELECT c.id,
               (SELECT count(*) FROM plan p
                 WHERE p.client_id = c.id AND p.deleted_at IS NULL) AS plans
          FROM client c
         WHERE c.nutritionist_id = $1 AND c.full_name_pseudonym = $2
           AND c.deleted_at IS NULL
        """,
        nutri_id,
        name,
    )


async def main(dry_run: bool) -> int:
    generated = 0
    skipped = 0
    failed = 0

    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            nutris = await _nutri_ids(conn)

            for name, nutri_key, target, sign in TARGETS:
                nutri_id = nutris.get(nutri_key, "")
                if not nutri_id:
                    print(f"{name:<24} SALTADO   no existe su nutricionista")
                    skipped += 1
                    continue

                row = await _client(conn, nutri_id, name)
                if row is None:
                    print(f"{name:<24} SALTADO   el cliente no existe todavia")
                    skipped += 1
                    continue

                missing = target - row["plans"]
                if missing <= 0:
                    print(f"{name:<24} al dia    ya tiene {row['plans']} de {target}")
                    skipped += 1
                    continue

                for _ in range(missing):
                    if dry_run:
                        print(f"{name:<24} generaria un plan"
                              f"{' y lo firmaria' if sign else ' como borrador'}")
                        generated += 1
                        continue

                    started = time.monotonic()
                    try:
                        result = await service.run_generation(
                            conn,
                            nutritionist_id=nutri_id,
                            client_id=row["id"],
                            duration_days=DURATION_DAYS,
                            meals_per_day=MEALS_PER_DAY,
                            extra=[],
                            persist=True,
                        )
                    except Exception as exc:  # noqa: BLE001  (se reporta y sigue)
                        print(f"{name:<24} ERROR     {type(exc).__name__}: {exc}")
                        failed += 1
                        continue
                    elapsed = time.monotonic() - started

                    if result.status != "feasible":
                        core = sorted({r.type for r in result.unsat_core})
                        print(f"{name:<24} INFACTIBLE  core={core}  {elapsed:.1f}s")
                        failed += 1
                        continue

                    dev = result.metrics.kcal_mean_deviation_pct
                    dev_txt = "sin objetivo" if dev is None else f"{dev:.2f}%"
                    state = "borrador"
                    if sign:
                        status, _ = await persistence.sign_plan(
                            conn, result.plan_id, nutri_id
                        )
                        state = "firmado" if status == "signed" else status

                    print(f"{name:<24} plan {result.plan_id:<4} {state:<9}"
                          f" {result.metrics.solve_status:<8} {elapsed:5.1f}s"
                          f"  kcal {dev_txt:<12}"
                          f" validador {'ok' if result.validation.passed else 'con hallazgos'}")
                    generated += 1

    print(f"\ngenerados {generated}, sin cambios {skipped}, con problema {failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="dice que haria sin generar nada")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.dry_run)))
