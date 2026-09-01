"""Compares model versions (v0, v1, current) on the same catalog and cases.

Three subcommands:

    dump     loads clients, constraints and the catalog with the current loader
             and freezes every case input into a JSON file, so all versions
             consume exactly the same data.
    run      executes the frozen cases against the solver package of a given
             source tree (a git worktree checked out at the version's commit),
             with the same time limit for every version. Does not touch the
             database. Resumable per case and repetition.
    analyze  computes the comparison metrics from the dumped plans, outside any
             version's code: times, status, kcal deviation, serving realism
             against the current profiles, and variety.

Usage (from Repo/backend, venv active):
    python -m scripts.exp_versions dump
    python -m scripts.exp_versions run --tree PATH\\to\\worktree\\backend --label v0
    python -m scripts.exp_versions analyze
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys

BASE_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "feedback-docs",
    "experimentos-motor",
)
INPUTS = os.path.join(BASE_DIR, "versiones_entradas.json")
TIME_LIMIT_S = 90.0

NUTRI = "03f06edf-603e-489d-8aed-71bc93f97ef0"


# --- dump --------------------------------------------------------------------


async def _dump():
    from app.db import connection_pool
    from app.solver import Constraint
    from app.solver.loader import (
        load_client,
        load_constraints,
        load_food_pool,
        load_meal_type_codes,
    )

    def cons_dicts(cons):
        return [c.__dict__ for c in cons]

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
                {"name": "bank2_kcal_only", "client": maria.__dict__,
                 "duration_days": 7, "meals_per_day": 5, "meal_codes": m5,
                 "constraints": cons_dicts(
                     [c for c in maria_cons if c.type == "kcal_target"])},
                {"name": "bank3_kcal_prefer", "client": maria.__dict__,
                 "duration_days": 7, "meals_per_day": 5, "meal_codes": m5,
                 "constraints": cons_dicts(maria_cons)},
                {"name": "bank4_forbid_protmin", "client": john.__dict__,
                 "duration_days": 7, "meals_per_day": 5, "meal_codes": m5,
                 "constraints": cons_dicts(john_cons)},
                {"name": "bank5_forbid_sodmax", "client": emma.__dict__,
                 "duration_days": 7, "meals_per_day": 5, "meal_codes": m5,
                 "constraints": cons_dicts(emma_cons)},
                {"name": "bank8_design", "client": maria.__dict__,
                 "duration_days": 7, "meals_per_day": 4, "meal_codes": m4,
                 "constraints": cons_dicts(design)},
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
                cases.append({
                    "name": f"demo_{r['id']}_{slug}", "client": client.__dict__,
                    "duration_days": 7, "meals_per_day": 4, "meal_codes": m4,
                    "constraints": cons_dicts(cons),
                })

    payload = {
        "nutrient_codes": ncodes,
        "foods": [
            {**f.__dict__, "tag_ids": sorted(f.tag_ids),
             "tag_codes": sorted(f.tag_codes)}
            for f in foods
        ],
        "cases": cases,
    }
    os.makedirs(BASE_DIR, exist_ok=True)
    with open(INPUTS, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=1, ensure_ascii=False)
    print(f"{len(cases)} casos y {len(foods)} alimentos en {INPUTS}")


# --- run ---------------------------------------------------------------------


def _keep_awake():
    """Self-contained copy: this mode must not import current app modules."""
    if sys.platform == "win32":
        import ctypes

        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001)


def _run(tree, label, reps):
    _keep_awake()
    tree = os.path.abspath(tree)
    if not os.path.isdir(os.path.join(tree, "app", "solver")):
        raise SystemExit(f"no parece un backend: {tree}")
    sys.path.insert(0, tree)
    for mod in [m for m in sys.modules if m == "app" or m.startswith("app.")]:
        del sys.modules[mod]
    from dataclasses import asdict, fields as dc_fields

    import app.solver as S

    with open(INPUTS, encoding="utf-8") as fh:
        inputs = json.load(fh)

    food_fields = {f.name for f in dc_fields(S.Food)}
    cons_fields = {f.name for f in dc_fields(S.Constraint)}
    client_fields = {f.name for f in dc_fields(S.ClientProfile)}

    def make_food(d):
        kw = {k: v for k, v in d.items() if k in food_fields}
        for set_field in ("tag_ids", "tag_codes"):
            if set_field in food_fields:
                kw[set_field] = set(d[set_field])
        return S.Food(**kw)

    foods = [make_food(d) for d in inputs["foods"]]
    ncodes = {int(k): v for k, v in inputs["nutrient_codes"].items()}

    out_path = os.path.join(BASE_DIR, f"versiones_{label}.json")
    results = {}
    if os.path.exists(out_path):
        with open(out_path, encoding="utf-8") as fh:
            results = json.load(fh)

    for case in inputs["cases"]:
        name = case["name"]
        entry = results.setdefault(name, {"reps": []})
        client = S.ClientProfile(
            **{k: v for k, v in case["client"].items() if k in client_fields})
        cons = [
            S.Constraint(**{k: v for k, v in d.items() if k in cons_fields})
            for d in case["constraints"]
        ]
        while len(entry["reps"]) < reps:
            i = len(entry["reps"]) + 1
            print(f"[{label}] {name} rep {i}/{reps}")
            r = S.generate_plan(
                client, case["duration_days"], case["meals_per_day"], cons,
                foods, nutrient_codes=ncodes, meal_codes=case["meal_codes"],
                time_limit_s=TIME_LIMIT_S,
            )
            if isinstance(r, S.FeasiblePlan):
                rep = {"metrics": asdict(r.metrics),
                       "days": asdict(r)["days"]}
                if rep["metrics"]["solve_time_ms"] > TIME_LIMIT_S * 2000:
                    print(f"      descartada: {rep['metrics']['solve_time_ms']}ms "
                          "(suspension del sistema)")
                    continue
            else:
                status = "infeasible" if r.unsat_core else "unknown"
                rep = {"metrics": {"solve_status": status}}
            entry["reps"].append(rep)
            with open(out_path, "w", encoding="utf-8") as fh:
                json.dump(results, fh, ensure_ascii=False)
            print(f"      status={rep['metrics']['solve_status']} "
                  f"time={rep['metrics'].get('solve_time_ms', '-')}ms")
    print(f"resultados en {out_path}")


# --- analyze -----------------------------------------------------------------


MAIN_MEAL_CODES = {"breakfast", "lunch", "dinner"}
FALLBACK_MIN, FALLBACK_MAX, MIN_PRESENT = 20.0, 250.0, 10


def _profile(food):
    lo = food["min_serving_g"] if food["min_serving_g"] is not None else FALLBACK_MIN
    hi = food["max_serving_g"] if food["max_serving_g"] is not None else FALLBACK_MAX
    return max(round(lo), MIN_PRESENT), round(hi)


def version_metrics(label):
    """Aggregated comparison metrics of one version, from its dumped plans."""
    with open(INPUTS, encoding="utf-8") as fh:
        inputs = json.load(fh)
    foods = {f["id"]: f for f in inputs["foods"]}

    path = os.path.join(BASE_DIR, f"versiones_{label}.json")
    with open(path, encoding="utf-8") as fh:
        results = json.load(fh)
    times, statuses, kdevs = [], [], []
    n_items = at_attractor = outside_profile = 0
    distinct_day, same_day_peak = [], []
    for name, entry in results.items():
        for rep in entry["reps"]:
            st = rep["metrics"]["solve_status"]
            statuses.append(st)
            if st in ("infeasible", "unknown"):
                continue
            times.append(rep["metrics"]["solve_time_ms"] / 1000)
            if rep["metrics"].get("kcal_mean_deviation_pct") is not None:
                kdevs.append(rep["metrics"]["kcal_mean_deviation_pct"])
            for day in rep["days"]:
                for meal in day["meals"]:
                    for it in meal["items"]:
                        n_items += 1
                        g = it["grams"]
                        if g in (10, 300):
                            at_attractor += 1
                        lo, hi = _profile(foods[it["food_id"]])
                        if not lo <= g <= hi:
                            outside_profile += 1
                distinct_day.append(len(set(
                    it["food_id"] for meal in day["meals"]
                    for it in meal["items"])))
                counts = {}
                for meal in day["meals"]:
                    for it in meal["items"]:
                        counts[it["food_id"]] = counts.get(it["food_id"], 0) + 1
                same_day_peak.append(max(counts.values()) if counts else 0)
    return {
        "n_cases": len(results),
        "statuses": statuses,
        "time_mean": statistics.mean(times),
        "time_min": min(times),
        "time_max": max(times),
        "kcal_dev_mean": statistics.mean(kdevs),
        "pct_attractor": 100 * at_attractor / n_items,
        "pct_outside_profile": 100 * outside_profile / n_items,
        "distinct_day_mean": statistics.mean(distinct_day),
        "same_day_peak": max(same_day_peak),
    }


def _analyze(labels):
    print("| Version | Casos | Status | Tiempo medio (rango) s | Desv kcal media | "
          "Items 10/300 g | Fuera de perfil | Distintos/dia | Max mismo/dia |")
    print("|---|---|---|---|---|---|---|---|---|")
    for label in labels:
        m = version_metrics(label)
        st = m["statuses"]
        st_summary = "/".join(
            f"{st.count(s)} {s}"
            for s in ("optimal", "feasible", "infeasible", "unknown")
            if st.count(s))
        print(
            f"| {label} | {m['n_cases']} | {st_summary} "
            f"| {m['time_mean']:.1f} ({m['time_min']:.1f}-{m['time_max']:.1f}) "
            f"| {m['kcal_dev_mean']:.2f}% "
            f"| {m['pct_attractor']:.1f}% "
            f"| {m['pct_outside_profile']:.1f}% "
            f"| {m['distinct_day_mean']:.1f} "
            f"| {m['same_day_peak']} |"
        )


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("dump")
    p_run = sub.add_parser("run")
    p_run.add_argument("--tree", required=True)
    p_run.add_argument("--label", required=True)
    p_run.add_argument("--reps", type=int, default=3)
    p_an = sub.add_parser("analyze")
    p_an.add_argument("--labels", default="v0,v1,v2")
    args = ap.parse_args()

    if args.cmd == "dump":
        import asyncio
        asyncio.run(_dump())
    elif args.cmd == "run":
        _run(args.tree, args.label, args.reps)
    else:
        _analyze(args.labels.split(","))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
