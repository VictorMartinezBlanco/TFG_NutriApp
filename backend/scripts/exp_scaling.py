"""Scaling experiment: solve time versus days, meals and catalog size.

Sweeps one dimension at a time around the app default (7 days, 4 meals, full
catalog) with a fixed real client and constraint set, repeating each cell. The
catalog subsampling is systematic by food id (every k-th food of the ordered
catalog), so it is reproducible and spreads across food groups.

Resumable: cells already present in the output JSON keep their finished reps.

Usage (from Repo/backend, venv active):
    python -m scripts.exp_scaling [--reps N] [--fresh] [--out PATH]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os

from app.db import connection_pool
from app.solver import FeasiblePlan, generate_plan
from app.solver import config as C
from app.solver.loader import (
    load_client,
    load_constraints,
    load_food_pool,
    load_meal_type_codes,
)
from scripts.exp_symmetry import SUSPEND_FACTOR, keep_system_awake

NUTRI = "03f06edf-603e-489d-8aed-71bc93f97ef0"
CLIENT_NAME = "Lucia Fernandez"

DAYS_SWEEP = (3, 7, 14)
MEALS_SWEEP = (3, 4, 5)
CATALOG_SWEEP = (30, 60, 100)
DEFAULT = (7, 4, 100)

DEFAULT_OUT = os.path.join(
    os.path.dirname(__file__), "..", "..", "feedback-docs", "experimentos-motor",
    "escalado_crudos.json",
)


def subsample(foods, size):
    """Systematic sample by id order: every k-th food, deterministic."""
    if size >= len(foods):
        return foods
    ordered = sorted(foods, key=lambda f: f.id)
    step = len(ordered) / size
    return [ordered[int(i * step)] for i in range(size)]


def cells():
    seen = set()
    for dd in DAYS_SWEEP:
        seen.add((dd, DEFAULT[1], DEFAULT[2]))
    for mm in MEALS_SWEEP:
        seen.add((DEFAULT[0], mm, DEFAULT[2]))
    for cat in CATALOG_SWEEP:
        seen.add((DEFAULT[0], DEFAULT[1], cat))
    return sorted(seen)


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--fresh", action="store_true")
    args = ap.parse_args()

    out_path = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    results = {}
    if not args.fresh and os.path.exists(out_path):
        with open(out_path, encoding="utf-8") as fh:
            results = json.load(fh)
    keep_system_awake()

    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            ncodes = {r["id"]: r["code"]
                      for r in await conn.fetch("SELECT id, code FROM nutrient")}
            foods = await load_food_pool(conn, NUTRI)
            cid = await conn.fetchval(
                "SELECT id FROM client WHERE nutritionist_id=$1 AND full_name_pseudonym=$2",
                NUTRI, CLIENT_NAME,
            )
            client = await load_client(conn, cid)
            cons = await load_constraints(conn, cid, NUTRI)
            mcodes_by_count = {
                mm: await load_meal_type_codes(conn, mm) for mm in MEALS_SWEEP
            }

    for dd, mm, cat in cells():
        key = f"{dd}d_{mm}m_{cat}f"
        entry = results.setdefault(key, {"reps": []})
        pool_foods = subsample(foods, cat)
        while len(entry["reps"]) < args.reps:
            i = len(entry["reps"]) + 1
            print(f"[run ] {key} rep {i}/{args.reps}")
            r = generate_plan(client, dd, mm, cons, pool_foods,
                              nutrient_codes=ncodes,
                              meal_codes=mcodes_by_count[mm])
            if (isinstance(r, FeasiblePlan) and r.metrics.solve_time_ms
                    > C.SOLVE_TIME_LIMIT_S * SUSPEND_FACTOR * 1000):
                print(f"      descartada: {r.metrics.solve_time_ms}ms "
                      "(suspension del sistema)")
                continue
            if isinstance(r, FeasiblePlan):
                rep = {
                    "status": r.metrics.solve_status,
                    "solve_time_ms": r.metrics.solve_time_ms,
                    "objective_value": r.metrics.objective_value,
                    "optimality_gap": r.metrics.optimality_gap,
                    "kcal_mean_deviation_pct": r.metrics.kcal_mean_deviation_pct,
                }
            else:
                # an empty core means the solver ran out of time without an
                # answer (unknown), not a proven infeasibility.
                rep = {
                    "status": "infeasible" if r.unsat_core else "unknown",
                    "core_types": sorted({c.type for c in r.unsat_core}),
                }
            entry["reps"].append(rep)
            with open(out_path, "w", encoding="utf-8") as fh:
                json.dump(results, fh, indent=1, ensure_ascii=False)
            print(f"      status={rep['status']} "
                  f"time={rep.get('solve_time_ms', '-')}ms")

    print(f"\nresultados en {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
