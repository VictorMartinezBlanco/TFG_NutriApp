"""Tolerance bands on the soft energy and macro targets, measured against the
current objective.

Three arms over the same cases: base (no bands, current weights), A (bands and
plan-mean anchor with the current weights) and B (same bands with the
structural family times 10). Each rep records status, wall time, objective
reported and recomputed from the solution, the signed daily and mean deviations
from every soft target, the excess outside both bands, and the structural counts
(unused foods, appearances over the spread cap).

Resumable per case, arm and repetition. Usage (from Repo/backend, venv active):
    python -m scripts.exp_objective [--reps N] [--arms base,A,B] [--fresh]
    python -m scripts.exp_objective --table
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from statistics import median

from app.db import connection_pool
from app.solver import Constraint, FeasiblePlan, generate_plan
from app.solver import config as C
from app.solver.model import scale_target
from scripts.exp_magnitudes import (
    UNIT_SCALED,
    _daily_scaled,
    build_cases,
    measure_case,
)
from scripts.exp_symmetry import SUSPEND_FACTOR, keep_system_awake

DEFAULT_OUT = os.path.join(
    os.path.dirname(__file__), "..", "..", "feedback-docs", "experimentos-objetivo",
    "bandas_crudos.json",
)

X10 = C.ObjectiveWeights(w_prefer=40000, w_no_repeat=50000,
                         w_variety=50000, w_spread=40000)

ARMS = {
    "base": (C.NO_BANDS, C.DEFAULT_WEIGHTS),
    "A": (C.DEFAULT_BANDS, C.DEFAULT_WEIGHTS),
    "B": (C.DEFAULT_BANDS, X10),
}

# case groups of the pre-registration.
CLEAN = ["bank2_kcal_only", "bank3_kcal_prefer", "demo_27_david",
         "demo_31_carlos", "design_macro"]
CONFLICT = ["demo_30_tomas"]

MACRO_FAMILY = {C.PROTEIN_CODE, C.CARB_CODE, C.FAT_CODE}


def _target_stats(plan, foods_by_id, code, target_real, band_day, band_mean):
    """Signed deviations in natural units (kcal or g) and the excess outside
    each band, for one soft target."""
    target = scale_target(target_real)
    daily = _daily_scaled(plan, foods_by_id, code)
    devs = [(daily[d] - target) / UNIT_SCALED for d in sorted(daily)]
    mean = sum(devs) / len(devs)
    return {
        "target": target_real,
        "daily_signed": [round(x, 1) for x in devs],
        "mean_signed": round(mean, 2),
        "worst_abs": round(max(abs(x) for x in devs), 1),
        "out_day": round(sum(max(0.0, abs(x) - band_day) for x in devs), 1),
        "out_mean": round(max(0.0, abs(mean) - band_mean), 2),
        "band_day": band_day,
        "band_mean": band_mean,
    }


def rep_record(r, cons, foods, ncodes, mcodes, weights, bands):
    foods_by_id = {f.id: f for f in foods}
    terms, recomputed = measure_case(r, cons, foods, ncodes, mcodes, w=weights)
    used = {it.food_id for d in r.days for m in d.meals for it in m.items}
    spread = next(t["raw_realized"] for t in terms if t["family"] == "spread")
    rec = {
        "status": r.metrics.solve_status,
        "wall_s": round(r.metrics.solve_time_ms / 1000, 2),
        "objective_value": r.metrics.objective_value,
        "objective_recomputed": recomputed,
        "recompute_exact": recomputed == r.metrics.objective_value,
        "gap": r.metrics.optimality_gap,
        "kcal_mean_deviation_pct": r.metrics.kcal_mean_deviation_pct,
        "distinct": len(used),
        "unused": len(foods) - len(used),
        "spread_over": spread,
        "targets": {},
    }
    for c in cons:
        if c.priority != "soft" or c.value is None:
            continue
        if c.type == "kcal_target":
            rec["targets"]["kcal"] = _target_stats(
                r, foods_by_id, C.KCAL_CODE, c.value, bands.kcal_day, bands.kcal_mean)
        elif c.type == "macro_target":
            code = ncodes.get(c.target_nutrient_id)
            if code in MACRO_FAMILY:
                rec["targets"][code] = _target_stats(
                    r, foods_by_id, code, c.value,
                    c.value * bands.macro_day_pct / 100,
                    c.value * bands.macro_mean_pct / 100)
    return rec


def solve_arm(arm, client, dd, mm, cons, foods, ncodes, mcodes):
    bands, weights = ARMS[arm]
    saved = C.DEFAULT_BANDS
    C.DEFAULT_BANDS = bands
    try:
        r = generate_plan(client, dd, mm, cons, foods,
                          nutrient_codes=ncodes, meal_codes=mcodes, weights=weights)
        if not isinstance(r, FeasiblePlan):
            core = getattr(r, "unsat_core", None) or []
            return {"status": "no_plan", "wall_s": 0.0,
                    "core_types": [getattr(x, "type", str(x)) for x in core]}
        return rep_record(r, cons, foods, ncodes, mcodes, weights, bands)
    finally:
        C.DEFAULT_BANDS = saved


async def all_cases(conn):
    cases, foods, ncodes = await build_cases(conn)
    # design case: Maria's soft kcal target plus a soft protein target, the
    # only way to exercise the macro band outside the conflict case.
    _, maria, dd, mm, kcal_only, m5 = cases[0]
    prot_id = next(k for k, v in ncodes.items() if v == C.PROTEIN_CODE)
    design = list(kcal_only) + [
        Constraint(id=-301, type="macro_target", priority="soft", weight=7,
                   operator="approx", value=90, target_nutrient_id=prot_id,
                   context={}),
    ]
    cases.append(("design_macro", maria, dd, mm, design, m5))
    return cases, foods, ncodes


# --- tables -----------------------------------------------------------------


def _med(vals):
    return median(vals) if vals else None


def _fmt(x, nd=1):
    if x is None:
        return "-"
    if isinstance(x, float):
        return f"{x:.{nd}f}".replace(".", ",")
    return str(x)


def summarize(out_path):
    with open(out_path, encoding="utf-8") as fh:
        results = json.load(fh)
    arms = [a for a in ARMS if any(a in e for e in results.values())]

    print("\n## Status y tiempo por caso y brazo (optimos de N, mediana de wall s)\n")
    print("| Caso | " + " | ".join(arms) + " |")
    print("|" + "---|" * (len(arms) + 1))
    for name, e in results.items():
        cells = []
        for a in arms:
            reps = [r for r in e.get(a, []) if r["status"] != "no_plan"]
            n_all = len(e.get(a, []))
            if not reps:
                cells.append("-" if not n_all else "sin plan")
                continue
            opt = sum(1 for r in reps if r["status"] == "optimal")
            cells.append(f"{opt}/{n_all} opt, {_fmt(_med([r['wall_s'] for r in reps]))} s")
        print(f"| {name} | " + " | ".join(cells) + " |")

    print("\n## Alimentos sin usar (mediana) y apariciones sobre el tope de reparto\n")
    print("| Caso | " + " | ".join(arms) + " |")
    print("|" + "---|" * (len(arms) + 1))
    for name, e in results.items():
        cells = []
        for a in arms:
            reps = [r for r in e.get(a, []) if r["status"] != "no_plan"]
            if not reps:
                cells.append("-")
                continue
            cells.append(f"{_fmt(_med([r['unused'] for r in reps]), 0)} sin usar, "
                         f"{_fmt(_med([r['spread_over'] for r in reps]), 0)} reparto")
        print(f"| {name} | " + " | ".join(cells) + " |")

    print("\n## Desviacion del objetivo (kcal o g): media con signo, peor dia, "
          "exceso fuera de bandas (dia / media), por rep\n")
    print("| Caso | Objetivo | Brazo | Media con signo | Peor dia | Fuera dia | Fuera media |")
    print("|---|---|---|---|---|---|---|")
    for name, e in results.items():
        for a in arms:
            reps = [r for r in e.get(a, []) if r["status"] != "no_plan"]
            keys = sorted({k for r in reps for k in r.get("targets", {})})
            for k in keys:
                ts = [r["targets"][k] for r in reps if k in r.get("targets", {})]
                print(f"| {name} | {k} | {a} | "
                      + " / ".join(_fmt(t["mean_signed"]) for t in ts) + " | "
                      + " / ".join(_fmt(t["worst_abs"]) for t in ts) + " | "
                      + " / ".join(_fmt(t["out_day"]) for t in ts) + " | "
                      + " / ".join(_fmt(t["out_mean"], 2) for t in ts) + " |")

    exact = [r["recompute_exact"] for e in results.values() for a in arms
             for r in e.get(a, []) if r["status"] != "no_plan"]
    print(f"\nrecomputacion exacta en {sum(exact)}/{len(exact)} resoluciones")

    if "base" in arms:
        for a in arms:
            if a != "base":
                criteria(results, a)


def criteria(results, arm):
    """Pre-registered admissibility checks of one bands arm against base."""
    print(f"\n## Criterios pre-registrados, brazo {arm}\n")
    ok_all = True

    def plans(name, a):
        return [r for r in results.get(name, {}).get(a, []) if r["status"] != "no_plan"]

    # 1. structure on the clean affected cases.
    improved, worsened = [], []
    for name in CLEAN:
        b, t = plans(name, "base"), plans(name, arm)
        if not b or not t:
            continue
        ub, ut = _med([r["unused"] for r in b]), _med([r["unused"] for r in t])
        ob = sum(1 for r in b if r["status"] == "optimal")
        ot = sum(1 for r in t if r["status"] == "optimal")
        if ut < ub or (ob < 2 <= ot):
            improved.append(name)
        if ut > ub:
            worsened.append(name)
    c1 = len(improved) >= 3 and not worsened
    ok_all &= c1
    print(f"1. estructura: mejoran {len(improved)}/5 {improved}; empeoran {worsened}"
          f" -> {'PASS' if c1 else 'FAIL'}")

    # 2. nutrition outside the bands on the clean cases.
    bad = []
    for name in CLEAN:
        for r in plans(name, arm):
            for k, t in r.get("targets", {}).items():
                if r["status"] == "optimal":
                    if t["out_day"] > 0 or t["out_mean"] > 0:
                        bad.append((name, k, "optimo fuera de banda"))
                else:
                    limit = 0.01 * t["target"] * len(t["daily_signed"])
                    if t["out_day"] >= limit or t["out_mean"] > 0:
                        bad.append((name, k, f"fuera dia {t['out_day']} / media {t['out_mean']}"))
    c2 = not bad
    ok_all &= c2
    print(f"2. fuera de banda: {bad or 'ninguna violacion'} -> {'PASS' if c2 else 'FAIL'}")

    # 3. feasibility everywhere.
    lost = [(n, len([r for r in e.get(arm, []) if r["status"] == "no_plan"]))
            for n, e in results.items() if any(r["status"] == "no_plan" for r in e.get(arm, []))]
    c3 = not lost
    ok_all &= c3
    print(f"3. factibilidad: {lost or 'todos devuelven plan'} -> {'PASS' if c3 else 'FAIL'}")

    # 4. proven optima kept.
    lost_opt = []
    for name, e in results.items():
        b, t = plans(name, "base"), plans(name, arm)
        if len(b) >= 3 and all(r["status"] == "optimal" for r in b):
            if sum(1 for r in t if r["status"] != "optimal") > 1:
                lost_opt.append(name)
    c4 = not lost_opt
    ok_all &= c4
    print(f"4. optimos probados: pierden {lost_opt or 'ninguno'} -> {'PASS' if c4 else 'FAIL'}")

    print(f"\nbrazo {arm}: {'ADMISIBLE' if ok_all else 'NO ADMISIBLE'} "
          "(criterio 5, bancos, se comprueba aparte)")


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--arms", default="base,A,B")
    ap.add_argument("--fresh", action="store_true")
    ap.add_argument("--table", action="store_true")
    args = ap.parse_args()

    out_path = os.path.abspath(args.out)
    if args.table:
        summarize(out_path)
        return 0
    run_arms = [a for a in args.arms.split(",") if a in ARMS]

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    results = {}
    if not args.fresh and os.path.exists(out_path):
        with open(out_path, encoding="utf-8") as fh:
            results = json.load(fh)

    keep_system_awake()
    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            cases, foods, ncodes = await all_cases(conn)

    for name, client, dd, mm, cons, mcodes in cases:
        entry = results.setdefault(name, {})
        for arm in run_arms:
            reps = entry.setdefault(arm, [])
            while len(reps) < args.reps:
                i = len(reps) + 1
                print(f"[run ] {name} {arm} rep {i}/{args.reps}", flush=True)
                rep = solve_arm(arm, client, dd, mm, cons, foods, ncodes, mcodes)
                if rep["wall_s"] > C.SOLVE_TIME_LIMIT_S * SUSPEND_FACTOR:
                    print(f"      descartada: wall {rep['wall_s']}s con limite "
                          f"{C.SOLVE_TIME_LIMIT_S}s (suspension del sistema)")
                    continue
                reps.append(rep)
                with open(out_path, "w", encoding="utf-8") as fh:
                    json.dump(results, fh, indent=1, ensure_ascii=False)
                extra = ""
                if rep["status"] != "no_plan":
                    k = rep["targets"].get("kcal")
                    extra = (f" unused={rep['unused']} exact={rep['recompute_exact']}"
                             + (f" kcal mean {k['mean_signed']:+} worst {k['worst_abs']}" if k else ""))
                print(f"      status={rep['status']} wall={rep['wall_s']}s{extra}", flush=True)

    print(f"\nresultados en {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
