"""Measures the real magnitude of each objective term on solved plans.

For a set of representative cases (bank cases plus the demo clients), solves the
plan and recomputes every objective term from the returned solution: raw value,
effective weight (family times row) and weighted contribution. Also derives an
analytic upper bound per term. The point is to compare the numeric scale of the
nutritional deviation terms (scaled units, 1 kcal = 1000) against the structural
and preference terms (units of 1 per appearance or food).

The recomputed weighted sum is checked against the objective value reported by
the solver, so the recomputation is verified exact per case.

Resumable: cases already present in the output JSON are skipped.

Usage (from Repo/backend, venv active):
    python -m scripts.exp_magnitudes [--fresh] [--out PATH]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os

from app.db import connection_pool
from app.solver import Constraint, FeasiblePlan, generate_plan
from app.solver import config as C
from app.solver.loader import (
    load_client,
    load_constraints,
    load_food_pool,
    load_meal_type_codes,
)
from app.solver.model import scale_target, scaled_100, serving_bounds

NUTRI = "03f06edf-603e-489d-8aed-71bc93f97ef0"

DEFAULT_OUT = os.path.join(
    os.path.dirname(__file__), "..", "..", "feedback-docs", "experimentos-motor",
    "magnitudes_crudos.json",
)

# scaled units that one natural unit (1 kcal, 1 g, 1 mg) of deviation is worth.
UNIT_SCALED = C.NUTRIENT_SCALE * 100


def _macro_family_weight(code, w):
    return {C.PROTEIN_CODE: w.w_protein, C.CARB_CODE: w.w_carb,
            C.FAT_CODE: w.w_fat}.get(code, w.w_protein)


def _daily_scaled(plan, foods_by_id, code):
    """Scaled nutrient sum per day, exactly as the model computes it."""
    out = {}
    for day in plan.days:
        tot = 0
        for meal in day.meals:
            for it in meal.items:
                tot += scaled_100(foods_by_id[it.food_id], code) * it.grams
        out[day.day_num] = tot
    return out


def _meal_scaled(plan, foods_by_id, code):
    out = {}
    for day in plan.days:
        for mi, meal in enumerate(day.meals):
            tot = sum(
                scaled_100(foods_by_id[it.food_id], code) * it.grams
                for it in meal.items
            )
            out[(day.day_num, mi)] = tot
    return out


def _appearances(plan, member_ids):
    per_day = {}
    total = 0
    for day in plan.days:
        n = sum(
            1 for meal in day.meals for it in meal.items
            if it.food_id in member_ids
        )
        per_day[day.day_num] = n
        total += n
    return per_day, total


def _presence_by_day(plan, member_ids):
    return {
        day.day_num: int(any(
            it.food_id in member_ids for meal in day.meals for it in meal.items
        ))
        for day in plan.days
    }


def _nut_upper(foods, meals_per_day, code):
    """Same domain bound the model uses for the daily sum of a nutrient."""
    max_serving = max((serving_bounds(f)[1] for f in foods), default=C.GRAMS_MAX)
    max_100 = max((scaled_100(f, code) for f in foods), default=0)
    return max_serving * len(foods) * max_100 * meals_per_day


def banded_raw(values, target, band_day, band_mean, factor):
    """The deviation the model actually penalizes for a daily target: per day
    only what exceeds the day band, plus the plan mean excess outside its own
    band times its factor. Zero bands give the plain absolute deviation."""
    devs = [v - target for v in values]
    raw = sum(max(0, abs(x) - band_day) for x in devs)
    if band_mean > 0:
        raw += factor * max(0, abs(sum(devs)) - len(devs) * band_mean)
    return raw


def _term(family, weight_family, weight_row, raw, raw_bound, detail=""):
    return {
        "family": family,
        "weight_family": weight_family,
        "weight_row": weight_row,
        "effective_weight": weight_family * weight_row,
        "raw_realized": raw,
        "weighted_realized": weight_family * weight_row * raw,
        "raw_bound": raw_bound,
        "weighted_bound": weight_family * weight_row * raw_bound,
        "detail": detail,
    }


def measure_case(plan, constraints, foods, ncodes, mcodes, w=C.DEFAULT_WEIGHTS):
    """Recompute every objective term from the solved plan."""
    foods_by_id = {f.id: f for f in foods}
    days = [d.day_num for d in plan.days]
    n_days, n_meals = len(days), len(plan.days[0].meals)
    slots = n_days * n_meals
    tag_members: dict[int, set[int]] = {}
    for f in foods:
        for tid in f.tag_ids:
            tag_members.setdefault(tid, set()).add(f.id)

    terms = []
    bonuses_total = 0
    penalties_total = 0

    for c in constraints:
        if c.priority != "soft" and c.type not in ("prefer_food", "prefer_tag"):
            continue
        if c.type == "kcal_target" and c.value is not None:
            target = scale_target(c.value)
            daily = _daily_scaled(plan, foods_by_id, C.KCAL_CODE)
            b = C.DEFAULT_BANDS
            raw = banded_raw(daily.values(), target, scale_target(b.kcal_day),
                             scale_target(b.kcal_mean), b.mean_factor)
            upper = _nut_upper(foods, n_meals, C.KCAL_CODE)
            bound = n_days * max(upper - target, target)
            terms.append(_term("kcal_target", w.w_kcal, c.weight, raw, bound,
                               f"target {c.value} kcal, dev in scaled units"))
        elif c.type == "macro_target" and c.value is not None:
            code = ncodes.get(c.target_nutrient_id)
            if code is None:
                continue
            target = scale_target(c.value)
            daily = _daily_scaled(plan, foods_by_id, code)
            b = C.DEFAULT_BANDS
            raw = banded_raw(daily.values(), target,
                             round(target * b.macro_day_pct / 100),
                             round(target * b.macro_mean_pct / 100), b.mean_factor)
            upper = _nut_upper(foods, n_meals, code)
            bound = n_days * max(upper - target, target)
            terms.append(_term("macro_target", _macro_family_weight(code, w),
                               c.weight, raw, bound, f"{code} target {c.value}"))
        elif c.type == "nutrient_min" and c.value is not None:
            code = ncodes.get(c.target_nutrient_id)
            if code is None:
                continue
            target = scale_target(c.value)
            daily = _daily_scaled(plan, foods_by_id, code)
            raw = sum(max(0, target - v) for v in daily.values())
            terms.append(_term("nutrient_min", _macro_family_weight(code, w),
                               c.weight, raw, n_days * target,
                               f"{code} min {c.value}"))
        elif c.type == "nutrient_max" and c.value is not None:
            code = ncodes.get(c.target_nutrient_id)
            if code is None:
                continue
            target = scale_target(c.value)
            daily = _daily_scaled(plan, foods_by_id, code)
            raw = sum(max(0, v - target) for v in daily.values())
            upper = _nut_upper(foods, n_meals, code)
            terms.append(_term("nutrient_max", w.w_kcal, c.weight, raw,
                               n_days * max(upper - target, 0),
                               f"{code} max {c.value}"))
        elif c.type == "meal_kcal_ratio":
            split = c.context.get("split") or {}
            if not split:
                continue
            daily = _daily_scaled(plan, foods_by_id, C.KCAL_CODE)
            meal = _meal_scaled(plan, foods_by_id, C.KCAL_CODE)
            raw = 0
            for day in plan.days:
                for mi in range(n_meals):
                    if mi >= len(mcodes):
                        continue
                    pct = split.get(mcodes[mi])
                    if pct is None:
                        continue
                    raw += abs(
                        meal[(day.day_num, mi)] * 1000
                        - round(float(pct) * 10) * daily[day.day_num]
                    )
            upper = _nut_upper(foods, n_meals, C.KCAL_CODE) * 1000
            terms.append(_term("meal_kcal_ratio", w.w_kcal, c.weight, raw,
                               n_days * len(split) * upper,
                               "dev in scaled units x1000"))
        elif c.type == "prefer_food" and c.target_food_id is not None:
            ctx = c.context.get("meal_type")
            raw = 0
            for day in plan.days:
                for mi, meal in enumerate(day.meals):
                    if ctx and (mi >= len(mcodes) or mcodes[mi] != ctx):
                        continue
                    raw += sum(1 for it in meal.items if it.food_id == c.target_food_id)
            terms.append(_term("prefer", w.w_prefer, c.weight, raw,
                               n_days * C.MAX_SAME_FOOD_PER_DAY,
                               "bonus, appearances"))
        elif c.type == "prefer_tag" and c.target_tag_id is not None:
            members = tag_members.get(c.target_tag_id, set())
            _, raw = _appearances(plan, members)
            bound = min(slots * C.MAX_ITEMS_PER_MEAL,
                        len(members) * n_days * C.MAX_SAME_FOOD_PER_DAY)
            terms.append(_term("prefer", w.w_prefer, c.weight, raw, bound,
                               "bonus, appearances"))
        elif c.type == "max_servings_per_period" and c.value is not None:
            members = set()
            if c.target_food_id is not None:
                members = {c.target_food_id}
            elif c.target_tag_id is not None:
                members = tag_members.get(c.target_tag_id, set())
            if not members:
                continue
            window = int(c.context.get("window_days", n_days))
            cap = int(c.value)
            per_day, _ = _appearances(plan, members)
            raw = 0
            n_windows = 0
            for start in days:
                wdays = [d for d in range(start, start + window) if d <= days[-1]]
                if not wdays:
                    continue
                n_windows += 1
                raw += max(0, sum(per_day[d] for d in wdays) - cap)
            bound = n_windows * max(0, min(window, n_days) * n_meals - cap)
            terms.append(_term("max_servings", w.w_no_repeat, c.weight, raw,
                               bound, "over per window"))
        elif c.type in ("no_repeat_food", "no_repeat_tag") and c.value is not None:
            members = set()
            if c.target_food_id is not None:
                members = {c.target_food_id}
            elif c.target_tag_id is not None:
                members = tag_members.get(c.target_tag_id, set())
            if not members:
                continue
            sep = int(c.value)
            pres = _presence_by_day(plan, members)
            raw = 0
            n_windows = 0
            for start in days:
                wdays = [d for d in range(start, start + sep) if d <= days[-1]]
                if len(wdays) <= 1:
                    continue
                n_windows += 1
                raw += max(0, sum(pres[d] for d in wdays) - 1)
            bound = n_windows * max(0, min(sep, n_days) - 1)
            terms.append(_term("no_repeat", w.w_no_repeat, c.weight, raw, bound,
                               "over per window"))

    for t in terms:
        if t["family"] == "prefer":
            bonuses_total += t["weighted_realized"]
        else:
            penalties_total += t["weighted_realized"]

    # structural terms, always present.
    used_ids = {
        it.food_id for day in plan.days for meal in day.meals for it in meal.items
    }
    p_variety = len(foods) - len(used_ids)
    terms.append(_term("variety", w.w_variety, 1, p_variety, len(foods),
                       "unused foods"))

    cap = max(1, math.ceil(C.MAX_APPEARANCES_PER_DAY_RATIO * n_days))
    counts: dict[int, int] = {}
    for day in plan.days:
        for meal in day.meals:
            for it in meal.items:
                counts[it.food_id] = counts.get(it.food_id, 0) + 1
    p_spread = sum(max(0, n - cap) for n in counts.values())
    spread_bound = len(foods) * max(0, n_days * C.MAX_SAME_FOOD_PER_DAY - cap)
    terms.append(_term("spread", w.w_spread, 1, p_spread, spread_bound,
                       f"appearances over cap {cap}"))

    recomputed = (penalties_total - bonuses_total
                  + w.w_variety * p_variety + w.w_spread * p_spread)
    return terms, recomputed


def dominant_step(constraints, ncodes, w=C.DEFAULT_WEIGHTS):
    """Objective cost of 1 natural unit (1 kcal, 1 g, 1 mg) of deviation of the
    heaviest nutritional soft row in the case."""
    best = 0
    for c in constraints:
        if c.priority != "soft":
            continue
        if c.type in ("kcal_target", "nutrient_max"):
            best = max(best, w.w_kcal * c.weight)
        elif c.type in ("macro_target", "nutrient_min"):
            code = ncodes.get(c.target_nutrient_id)
            best = max(best, _macro_family_weight(code, w) * c.weight)
        elif c.type == "meal_kcal_ratio":
            # its deviation carries an extra x1000 from the percent scaling.
            best = max(best, w.w_kcal * c.weight * 1000)
    return best * UNIT_SCALED


async def build_cases(conn):
    """Bank cases with soft terms plus the demo clients at the app default."""
    ncodes = {r["id"]: r["code"] for r in await conn.fetch("SELECT id, code FROM nutrient")}
    tids = {r["code"]: r["id"] for r in await conn.fetch("SELECT id, code FROM tag")}
    foods = await load_food_pool(conn, NUTRI)
    m4 = await load_meal_type_codes(conn, 4)
    m5 = await load_meal_type_codes(conn, 5)

    async def client_by_name(name):
        cid = await conn.fetchval(
            "SELECT id FROM client WHERE nutritionist_id=$1 AND full_name_pseudonym=$2",
            NUTRI, name,
        )
        return cid, await load_client(conn, cid), await load_constraints(conn, cid, NUTRI)

    _, maria, maria_cons = await client_by_name("Maria Gonzalez")
    _, john, john_cons = await client_by_name("John Smith")
    _, emma, emma_cons = await client_by_name("Emma Wilson")

    prot_id = next(k for k, v in ncodes.items() if v == "protein_g")
    oat_id = next((f.id for f in foods if f.name == "Oat flakes"), None)
    cases = [
        ("bank2_kcal_only", maria, 7, 5,
         [c for c in maria_cons if c.type == "kcal_target"], m5),
        ("bank3_kcal_prefer", maria, 7, 5, maria_cons, m5),
        ("bank4_forbid_protmin", john, 7, 5, john_cons, m5),
        ("bank5_forbid_sodmax", emma, 7, 5, emma_cons, m5),
        ("bank8_design", maria, 7, 4, [
            Constraint(id=-201, type="no_repeat_tag", priority="hard", weight=5,
                       operator="forbid", value=2,
                       target_tag_id=tids["fish_allergen"],
                       context={"granularity": "day"}),
            Constraint(id=-202, type="max_servings_per_period", priority="hard",
                       weight=5, operator="max", value=2,
                       target_tag_id=tids["red_meat"],
                       context={"window_days": 7}),
            Constraint(id=-203, type="meal_kcal_ratio", priority="soft", weight=5,
                       operator="approx",
                       context={"split": {"breakfast": 25, "lunch": 35,
                                          "dinner": 25, "snack": 15}}),
            Constraint(id=-204, type="prefer_food", priority="soft", weight=4,
                       operator="prefer", target_food_id=oat_id,
                       context={"meal_type": "breakfast"}),
        ], m4),
    ]

    demo_rows = await conn.fetch(
        """
        SELECT c.id, c.full_name_pseudonym FROM client c
        WHERE c.nutritionist_id = $1 AND c.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM diet_constraint dc
                      WHERE dc.scope_client_id = c.id AND dc.deleted_at IS NULL)
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


NUTRITIONAL = {"kcal_target", "macro_target", "nutrient_min", "nutrient_max",
               "meal_kcal_ratio"}


def print_tables(out_path):
    """Markdown tables from the raw JSON: per-case magnitudes and the Q ratio
    of each non-nutritional family against the dominant deviation step."""
    with open(out_path, encoding="utf-8") as fh:
        results = json.load(fh)

    fam_order = ["kcal_target", "macro_target", "nutrient_min", "nutrient_max",
                 "meal_kcal_ratio", "prefer", "no_repeat", "max_servings",
                 "variety", "spread"]
    print("\n## Contribucion ponderada realizada por familia y caso\n")
    header = "| Caso | status | " + " | ".join(fam_order) + " | objetivo |"
    print(header)
    print("|" + "---|" * (len(fam_order) + 3))
    for name, e in results.items():
        if e.get("status") not in ("optimal", "feasible"):
            continue
        by_fam = {}
        for t in e["terms"]:
            by_fam[t["family"]] = by_fam.get(t["family"], 0) + t["weighted_realized"]
        cells = [f"{by_fam.get(f, ''):,}".replace(",", ".") if f in by_fam else "-"
                 for f in fam_order]
        print(f"| {name} | {e['status']} | " + " | ".join(cells)
              + f" | {e['objective_value']:,} |".replace(",", "."))

    print("\n## Q por familia no nutricional (rango completo / paso de 1 unidad "
          "natural del termino dominante)\n")
    q_rows = {}
    for name, e in results.items():
        if e.get("status") not in ("optimal", "feasible"):
            continue
        step = e["dominant_step_scaled"]
        if not step:
            continue
        by_fam_bound = {}
        for t in e["terms"]:
            if t["family"] in NUTRITIONAL:
                continue
            by_fam_bound[t["family"]] = (
                by_fam_bound.get(t["family"], 0) + t["weighted_bound"]
            )
        q_rows[name] = {f: b / step for f, b in by_fam_bound.items()}
    fams = sorted({f for r in q_rows.values() for f in r})
    print("| Caso | " + " | ".join(fams) + " |")
    print("|" + "---|" * (len(fams) + 1))
    for name, r in q_rows.items():
        print(f"| {name} | " + " | ".join(
            f"{r[f]:.4f}" if f in r else "-" for f in fams) + " |")
    medians = {}
    for f in fams:
        vals = sorted(r[f] for r in q_rows.values() if f in r)
        if vals:
            mid = len(vals) // 2
            medians[f] = (vals[mid] if len(vals) % 2
                          else (vals[mid - 1] + vals[mid]) / 2)
    print("| mediana | " + " | ".join(
        f"{medians[f]:.4f}" if f in medians else "-" for f in fams) + " |")
    flagrant = [f for f, q in medians.items() if q < 1]
    print(f"\nfamilias con Q mediano < 1: {flagrant or 'ninguna'}")


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--fresh", action="store_true")
    ap.add_argument("--table", action="store_true",
                    help="print tables from existing raw JSON, no solving")
    args = ap.parse_args()

    if args.table:
        print_tables(os.path.abspath(args.out))
        return 0

    out_path = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    results = {}
    if not args.fresh and os.path.exists(out_path):
        with open(out_path, encoding="utf-8") as fh:
            results = json.load(fh)

    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            cases, foods, ncodes = await build_cases(conn)

    for name, client, dd, mm, cons, mcodes in cases:
        if name in results:
            print(f"[skip] {name} (already in output)")
            continue
        print(f"[run ] {name}: {dd}x{mm}, {len(cons)} constraints")
        r = generate_plan(client, dd, mm, cons, foods,
                          nutrient_codes=ncodes, meal_codes=mcodes)
        if not isinstance(r, FeasiblePlan):
            results[name] = {"status": "infeasible"}
            continue
        terms, recomputed = measure_case(r, cons, foods, ncodes, mcodes)
        entry = {
            "status": r.metrics.solve_status,
            "solve_time_ms": r.metrics.solve_time_ms,
            "objective_value": r.metrics.objective_value,
            "objective_recomputed": recomputed,
            "recompute_exact": recomputed == r.metrics.objective_value,
            "kcal_mean_deviation_pct": r.metrics.kcal_mean_deviation_pct,
            "dominant_step_scaled": dominant_step(cons, ncodes),
            "duration_days": dd,
            "meals_per_day": mm,
            "terms": terms,
        }
        results[name] = entry
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(results, fh, indent=1, ensure_ascii=False)
        flag = "OK" if entry["recompute_exact"] else "MISMATCH"
        print(f"      status={entry['status']} obj={entry['objective_value']} "
              f"recompute={flag}")

    print(f"\nresultados en {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
