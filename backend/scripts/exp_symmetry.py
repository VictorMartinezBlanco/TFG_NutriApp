"""Before/after measurement of the day symmetry breaking.

Builds the exact model generate_plan builds, with and without the lexicographic
chain between consecutive days, and solves both arms with the production
parameters, repeating each cell. Records total wall time, time to the first
incumbent (via solution callback), status, objective value and mean kcal
deviation. Cases where days are not interchangeable are recorded as not
applicable and skipped.

Resumable per case, arm and repetition.

Usage (from Repo/backend, venv active):
    python -m scripts.exp_symmetry [--reps N] [--fresh] [--out PATH]
"""

from __future__ import annotations

import argparse
import asyncio
import ctypes
import json
import os
import sys

from ortools.sat.python import cp_model


def keep_system_awake() -> None:
    """Asks Windows not to suspend while this process lives.

    A sleeping machine inflates CP-SAT's wall clock past the time limit and
    poisons every timing in the run. Cleared automatically on process exit.
    """
    if sys.platform == "win32":
        ES_CONTINUOUS, ES_SYSTEM_REQUIRED = 0x80000000, 0x00000001
        ctypes.windll.kernel32.SetThreadExecutionState(
            ES_CONTINUOUS | ES_SYSTEM_REQUIRED
        )


# a rep whose wall clock exceeds the limit by this factor went through a
# system suspend; it is discarded and repeated instead of recorded.
SUSPEND_FACTOR = 2.0

from app.db import connection_pool
from app.solver import Constraint, config as C
from app.solver.catalog import apply_constraints
from app.solver.loader import (
    load_client,
    load_constraints,
    load_food_pool,
    load_meal_type_codes,
)
from app.solver.model import build_base_model, scale_target
from app.solver.objective import set_objective

NUTRI = "03f06edf-603e-489d-8aed-71bc93f97ef0"

DEFAULT_OUT = os.path.join(
    os.path.dirname(__file__), "..", "..", "feedback-docs", "experimentos-motor",
    "simetria_crudos.json",
)


def days_interchangeable(constraints, n_days: int) -> bool:
    """True when permuting the plan's days maps solutions to solutions with the
    same objective, so imposing an order between days is sound.

    Days stop being interchangeable when some constraint couples specific days:
    the sliding windows of weekly variety (plans longer than 7 days; at exactly
    7 the single window covers the whole plan and is permutation invariant),
    clinical no-repeat windows wider than one day, and max-servings windows
    strictly between one day and the whole plan.
    """
    if n_days > 7:
        return False
    for c in constraints:
        if c.type in ("no_repeat_food", "no_repeat_tag"):
            if c.value is not None and int(c.value) > 1:
                return False
        elif c.type == "max_servings_per_period":
            window = int(c.context.get("window_days", n_days))
            if 1 < window < n_days:
                return False
    return True


def add_lex_chain(pm) -> None:
    """Lexicographic order between consecutive days over the presence vector
    x[f,d,m] in fixed (food, meal) order, with the standard prefix-equal
    booleans. This is the order a positional big-integer score would induce,
    without materializing the score (which overflows with catalog-sized F)."""
    model = pm.model
    for d1, d2 in zip(pm.days, pm.days[1:]):
        pairs = [
            (pm.x[(f.id, d1, m)], pm.x[(f.id, d2, m)])
            for f in pm.foods for m in pm.meals
        ]
        prefix_eq = None
        for i, (a, b) in enumerate(pairs):
            if prefix_eq is None:
                model.Add(a >= b)
            else:
                model.Add(a >= b).OnlyEnforceIf(prefix_eq)
            if i == len(pairs) - 1:
                break
            eq = model.NewBoolVar(f"sym_eq_{d1}_{i}")
            model.Add(a == b).OnlyEnforceIf(eq)
            model.Add(a != b).OnlyEnforceIf(eq.Not())
            if prefix_eq is None:
                prefix_eq = eq
            else:
                both = model.NewBoolVar(f"sym_pre_{d1}_{i}")
                model.AddBoolAnd([prefix_eq, eq]).OnlyEnforceIf(both)
                model.AddBoolOr([prefix_eq.Not(), eq.Not()]).OnlyEnforceIf(
                    both.Not()
                )
                prefix_eq = both


def add_kcal_order(pm) -> None:
    """Weak scalar variant: non-increasing daily energy between consecutive
    days. Six linear constraints on existing sums, no auxiliary variables;
    ties between equal-energy days stay unbroken on purpose."""
    for d1, d2 in zip(pm.days, pm.days[1:]):
        a = pm.daily_nut.get((d1, C.KCAL_CODE))
        b = pm.daily_nut.get((d2, C.KCAL_CODE))
        if a is not None and b is not None:
            pm.model.Add(a >= b)


ARMS = {"off": None, "on": add_lex_chain, "on_kcal": add_kcal_order}


class FirstIncumbent(cp_model.CpSolverSolutionCallback):
    def __init__(self):
        super().__init__()
        self.first_s = None

    def on_solution_callback(self):
        if self.first_s is None:
            self.first_s = self.WallTime()


def solve_arm(client, dd, mm, cons, foods, ncodes, mcodes, arm: str):
    warnings: list[str] = []
    pm = build_base_model(client, dd, mm, foods, mcodes, warnings)
    tag_members: dict[int, list[int]] = {}
    for f in foods:
        for tid in f.tag_ids:
            tag_members.setdefault(tid, []).append(f.id)
    applied = apply_constraints(
        pm, cons, tag_members=tag_members, nutrient_codes=ncodes,
        meal_codes=mcodes, weights=C.DEFAULT_WEIGHTS,
    )
    breaker = ARMS[arm]
    if breaker is not None:
        if not days_interchangeable(cons, dd):
            raise RuntimeError("symmetry arm requested on a non-applicable case")
        breaker(pm)
    set_objective(pm, applied.obj, C.DEFAULT_WEIGHTS)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = C.SOLVE_TIME_LIMIT_S
    solver.parameters.relative_gap_limit = C.SOLVE_RELATIVE_GAP
    solver.parameters.num_search_workers = C.SOLVE_WORKERS
    cb = FirstIncumbent()
    status = solver.Solve(pm.model, cb)

    rep = {
        "status": solver.StatusName(status).lower(),
        "wall_s": round(solver.WallTime(), 2),
        "first_incumbent_s": round(cb.first_s, 2) if cb.first_s is not None else None,
    }
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        rep["objective"] = int(solver.ObjectiveValue())
        rep["best_bound"] = int(solver.BestObjectiveBound())
        kcal_value = next(
            (c.value for c in cons if c.type == "kcal_target" and c.value),
            None,
        )
        if kcal_value:
            target = scale_target(kcal_value)
            devs = []
            for d in pm.days:
                dv = pm.daily_nut.get((d, C.KCAL_CODE))
                if dv is not None:
                    devs.append(abs(solver.Value(dv) - target) / target * 100)
            if devs:
                rep["kcal_mean_deviation_pct"] = round(sum(devs) / len(devs), 2)
    return rep


async def build_cases():
    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            ncodes = {r["id"]: r["code"]
                      for r in await conn.fetch("SELECT id, code FROM nutrient")}
            tids = {r["code"]: r["id"]
                    for r in await conn.fetch("SELECT id, code FROM tag")}
            foods = await load_food_pool(conn, NUTRI)
            m4 = await load_meal_type_codes(conn, 4)
            m5 = await load_meal_type_codes(conn, 5)

            async def by_name(name):
                cid = await conn.fetchval(
                    "SELECT id FROM client WHERE nutritionist_id=$1 "
                    "AND full_name_pseudonym=$2", NUTRI, name)
                return (await load_client(conn, cid),
                        await load_constraints(conn, cid, NUTRI))

            maria, maria_cons = await by_name("Maria Gonzalez")
            john, john_cons = await by_name("John Smith")
            emma, emma_cons = await by_name("Emma Wilson")

            oat_id = next((f.id for f in foods if f.name == "Oat flakes"), None)
            design = [
                Constraint(id=-201, type="no_repeat_tag", priority="hard",
                           weight=5, operator="forbid", value=2,
                           target_tag_id=tids["fish_allergen"],
                           context={"granularity": "day"}),
                Constraint(id=-202, type="max_servings_per_period",
                           priority="hard", weight=5, operator="max", value=2,
                           target_tag_id=tids["red_meat"],
                           context={"window_days": 7}),
                Constraint(id=-203, type="meal_kcal_ratio", priority="soft",
                           weight=5, operator="approx",
                           context={"split": {"breakfast": 25, "lunch": 35,
                                              "dinner": 25, "snack": 15}}),
                Constraint(id=-204, type="prefer_food", priority="soft",
                           weight=4, operator="prefer", target_food_id=oat_id,
                           context={"meal_type": "breakfast"}),
            ]

            cases = [
                ("bank2_kcal_only", maria, 7, 5,
                 [c for c in maria_cons if c.type == "kcal_target"], m5),
                ("bank3_kcal_prefer", maria, 7, 5, maria_cons, m5),
                ("bank4_forbid_protmin", john, 7, 5, john_cons, m5),
                ("bank5_forbid_sodmax", emma, 7, 5, emma_cons, m5),
                ("bank8_design", maria, 7, 4, design, m4),
            ]
            demo_rows = await conn.fetch(
                """
                SELECT c.id, c.full_name_pseudonym FROM client c
                WHERE c.nutritionist_id = $1 AND c.deleted_at IS NULL
                  AND EXISTS (SELECT 1 FROM diet_constraint dc
                              WHERE dc.scope_client_id = c.id
                                AND dc.deleted_at IS NULL)
                  AND c.id >= 27
                ORDER BY c.id
                """,
                NUTRI,
            )
            for r in demo_rows:
                client = await load_client(conn, r["id"])
                cons = await load_constraints(conn, r["id"], NUTRI)
                slug = r["full_name_pseudonym"].split()[0].lower()
                cases.append((f"demo_{r['id']}_{slug}", client, 7, 4, cons, m4))
            return cases, foods, ncodes


def summarize(out_path):
    with open(out_path, encoding="utf-8") as fh:
        results = json.load(fh)
    print("| Caso | Arm | Status | Wall s (medias) | 1er incumbente s | Desv kcal |")
    print("|---|---|---|---|---|---|")
    for name, entry in results.items():
        if not entry.get("applicable", True):
            print(f"| {name} | - | no aplicable | - | - | - |")
            continue
        for arm in ARMS:
            reps = entry.get(arm, [])
            if not reps:
                continue
            walls = [r["wall_s"] for r in reps]
            firsts = [r["first_incumbent_s"] for r in reps
                      if r.get("first_incumbent_s") is not None]
            devs = [r["kcal_mean_deviation_pct"] for r in reps
                    if r.get("kcal_mean_deviation_pct") is not None]
            statuses = "/".join(r["status"] for r in reps)
            first_cell = f"{sum(firsts)/len(firsts):.1f}" if firsts else "-"
            dev_cell = f"{sum(devs)/len(devs):.2f}" if devs else "-"
            print(f"| {name} | {arm} | {statuses} "
                  f"| {sum(walls)/len(walls):.1f} ({min(walls):.1f}-{max(walls):.1f}) "
                  f"| {first_cell} | {dev_cell} |")


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reps", type=int, default=5)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--fresh", action="store_true")
    ap.add_argument("--table", action="store_true")
    ap.add_argument("--arms", default=",".join(ARMS),
                    help="comma separated subset of arms to run")
    args = ap.parse_args()
    run_arms = [a for a in args.arms.split(",") if a in ARMS]

    out_path = os.path.abspath(args.out)
    if args.table:
        summarize(out_path)
        return 0

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    results = {}
    if not args.fresh and os.path.exists(out_path):
        with open(out_path, encoding="utf-8") as fh:
            results = json.load(fh)

    keep_system_awake()
    cases, foods, ncodes = await build_cases()

    for name, client, dd, mm, cons, mcodes in cases:
        applicable = days_interchangeable(cons, dd)
        entry = results.setdefault(name, {"applicable": applicable})
        entry["applicable"] = applicable
        if not applicable:
            print(f"[skip] {name}: dias no intercambiables")
            continue
        for arm in run_arms:
            reps = entry.setdefault(arm, [])
            while len(reps) < args.reps:
                i = len(reps) + 1
                print(f"[run ] {name} {arm} rep {i}/{args.reps}")
                rep = solve_arm(client, dd, mm, cons, foods, ncodes, mcodes,
                                arm=arm)
                if rep["wall_s"] > C.SOLVE_TIME_LIMIT_S * SUSPEND_FACTOR:
                    print(f"      descartada: wall {rep['wall_s']}s con limite "
                          f"{C.SOLVE_TIME_LIMIT_S}s (suspension del sistema)")
                    continue
                reps.append(rep)
                with open(out_path, "w", encoding="utf-8") as fh:
                    json.dump(results, fh, indent=1, ensure_ascii=False)
                print(f"      status={rep['status']} wall={rep['wall_s']}s "
                      f"first={rep['first_incumbent_s']}s")

    print(f"\nresultados en {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
