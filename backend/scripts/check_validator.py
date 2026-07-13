"""Test bench for the plan validator against the real catalog.

Validates the feasible plans the solver produces for the real clients (they
must pass) and a set of artificial plans that each break one rule family (they
must be caught with the right code and a hard failure). Reproducible: reads the
database with the service role and writes nothing.

Usage (from Repo/backend, venv active):
    python -m scripts.check_validator
"""

from __future__ import annotations

import asyncio
import copy

from app.db import connection_pool
from app.solver import (
    ClientProfile,
    Constraint,
    FeasiblePlan,
    Food,
    Meal,
    MealItem,
    generate_plan,
)
from app.solver.types import Day, SolveMetrics
from app.solver.loader import (
    load_client,
    load_constraints,
    load_food_pool,
    load_meal_type_codes,
)
from app.validator import Severity, validate_plan

NUTRI = "03f06edf-603e-489d-8aed-71bc93f97ef0"


async def _nutrient_codes(conn):
    rows = await conn.fetch("SELECT id, code FROM nutrient")
    return {r["id"]: r["code"] for r in rows}


async def _tag_ids(conn):
    rows = await conn.fetch("SELECT id, code FROM tag")
    return {r["code"]: r["id"] for r in rows}


async def _client_id(conn, name):
    return await conn.fetchval(
        "SELECT id FROM client WHERE nutritionist_id=$1 AND full_name_pseudonym=$2",
        NUTRI, name,
    )


def _tag_members(foods):
    members = {}
    for f in foods:
        for tid in f.tag_ids:
            members.setdefault(tid, []).append(f.id)
    return members


def _has_code(res, severity, code):
    return any(f.code == code and f.severity is severity for f in res.findings)


class Report:
    def __init__(self):
        self.passed = 0
        self.failed = 0

    def check(self, label, cond, detail=""):
        mark = "PASS" if cond else "FAIL"
        if cond:
            self.passed += 1
        else:
            self.failed += 1
        print(f"    [{mark}] {label}" + (f" -- {detail}" if detail else ""))


async def main() -> int:
    rep = Report()
    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            ncodes = await _nutrient_codes(conn)
            tids = await _tag_ids(conn)
            foods = await load_food_pool(conn, NUTRI)
            food_index = {f.id: f for f in foods}
            tag_members = _tag_members(foods)
            m3 = await load_meal_type_codes(conn, 3)
            m5 = await load_meal_type_codes(conn, 5)

            maria = await _client_id(conn, "Maria Gonzalez")
            john = await _client_id(conn, "John Smith")
            emma = await _client_id(conn, "Emma Wilson")

            maria_c = await load_client(conn, maria)
            john_c = await load_client(conn, john)
            emma_c = await load_client(conn, emma)

            maria_cons = await load_constraints(conn, maria, NUTRI)
            john_cons = await load_constraints(conn, john, NUTRI)
            emma_cons = await load_constraints(conn, emma, NUTRI)

            def gen(client, dd, mm, cons, mcodes):
                return generate_plan(
                    client, dd, mm, cons, foods,
                    nutrient_codes=ncodes, meal_codes=mcodes,
                )

            def val(plan, client, cons):
                return validate_plan(
                    plan, client, cons,
                    food_index=food_index, nutrient_codes=ncodes, tag_members=tag_members,
                )

            # ---- part 1: real plans must pass ----
            reals = [
                ("Maria trivial 3d/3m", maria_c, 3, 3, [], m3),
                ("Maria kcal + prefer 7d/5m", maria_c, 7, 5, maria_cons, m5),
                ("John forbid peanuts 7d/5m", john_c, 7, 5, john_cons, m5),
                ("Emma forbid lactose 7d/5m", emma_c, 7, 5, emma_cons, m5),
            ]
            for label, client, dd, mm, cons, mcodes in reals:
                print(f"\nReal. {label}")
                plan = gen(client, dd, mm, cons, mcodes)
                if not isinstance(plan, FeasiblePlan):
                    rep.check("solver factible", False, "el solver no dio plan factible")
                    continue
                res = val(plan, client, cons)
                rep.check("passed", res.passed)
                rep.check("sin hard_fail",
                          not any(f.severity is Severity.HARD_FAIL for f in res.findings),
                          f"findings={[f.code for f in res.findings]}")
                s = res.summary
                print(f"    summary kcal={s.kcal_mean:.0f} prot={s.protein_g_mean:.0f}g "
                      f"carb={s.carb_g_mean:.0f}g fat={s.fat_g_mean:.0f}g")

            # base plan reused for the mutated cases.
            base = gen(maria_c, 3, 3, [], m3)

            # ---- part 2a: kcal_floor ----
            print("\nBad. kcal below the safety floor")
            low = copy.deepcopy(base)
            for d in low.days:
                for m in d.meals:
                    m.items = m.items[:1]
                    for it in m.items:
                        it.grams = 10
            res = val(low, maria_c, [])
            rep.check("cazado", not res.passed)
            rep.check("code kcal_floor", _has_code(res, Severity.HARD_FAIL, "kcal_floor"))

            # ---- part 2b: protein out of human range (hand-built) ----
            print("\nBad. protein above the human range")
            beef = next((f for f in foods if "beef" in f.name.lower() or "Ternera" in f.name), None)
            prot_food = beef or max(foods, key=lambda f: f.nutrients.get("protein_g", 0.0))
            hi_plan = FeasiblePlan(
                days=[Day(day_num=1, meals=[
                    Meal(meal_type_code=m3[0], items=[MealItem(food_id=prot_food.id, grams=300)]),
                    Meal(meal_type_code=m3[1], items=[MealItem(food_id=prot_food.id, grams=300)]),
                    Meal(meal_type_code=m3[2], items=[MealItem(food_id=prot_food.id, grams=300)]),
                ])],
                metrics=SolveMetrics("feasible", 0, 100.0, 100.0, None, None, None),
            )
            res = val(hi_plan, maria_c, [])
            rep.check("cazado", not res.passed)
            rep.check("code protein_range", _has_code(res, Severity.HARD_FAIL, "protein_range"))

            # ---- part 2c: micro toxicity is a warning, not a hard fail ----
            print("\nWarn. sodium above the toxicity limit")
            salty = Food(id=999001, name="Synthetic salt", typical_serving_g=None,
                         nutrients={"energy_kcal": 400, "protein_g": 20, "fat_g": 15,
                                    "carb_g": 40, "sodium_mg": 4000},
                         tag_ids=set())
            idx_tox = dict(food_index)
            idx_tox[salty.id] = salty
            tox_plan = FeasiblePlan(
                days=[Day(day_num=1, meals=[
                    Meal(meal_type_code=m3[0], items=[MealItem(food_id=salty.id, grams=200)]),
                    Meal(meal_type_code=m3[1], items=[MealItem(food_id=salty.id, grams=200)]),
                ])],
                metrics=SolveMetrics("feasible", 0, 100.0, 100.0, None, None, None),
            )
            res = validate_plan(tox_plan, maria_c, [], food_index=idx_tox,
                                nutrient_codes=ncodes, tag_members=tag_members)
            rep.check("code micro_toxicity (warning)",
                      _has_code(res, Severity.WARNING, "micro_toxicity"))
            rep.check("no es hard_fail", not _has_code(res, Severity.HARD_FAIL, "micro_toxicity"))

            # ---- part 2d: hard forbid_tag violated ----
            print("\nBad. item with a hard-forbidden tag")
            used_tag = next(
                (tid for d in base.days for m in d.meals for it in m.items
                 for tid in food_index[it.food_id].tag_ids),
                None,
            )
            rep.check("hay un tag presente para prohibir", used_tag is not None)
            if used_tag is not None:
                forbid = Constraint(id=-1, type="forbid_tag", priority="hard", weight=10,
                                    operator="forbid", target_tag_id=used_tag)
                res = val(base, maria_c, [forbid])
                rep.check("cazado", not res.passed)
                rep.check("code forbid_tag", _has_code(res, Severity.HARD_FAIL, "forbid_tag"))

            # ---- part 2e: structural (too many items) ----
            print("\nBad. meal with more items than allowed")
            fat = copy.deepcopy(base)
            first_meal = fat.days[0].meals[0]
            filler = [it.food_id for d in base.days for m in d.meals for it in m.items]
            while len(first_meal.items) <= 4:
                fid = filler[len(first_meal.items) % len(filler)]
                first_meal.items.append(MealItem(food_id=fid, grams=20))
            res = val(fat, maria_c, [])
            rep.check("cazado", not res.passed)
            rep.check("code meal_structure", _has_code(res, Severity.HARD_FAIL, "meal_structure"))

            # ---- part 2f: min_grams ----
            print("\nBad. item below the minimum grams")
            tiny = copy.deepcopy(base)
            tiny.days[0].meals[0].items[0].grams = 1
            res = val(tiny, maria_c, [])
            rep.check("cazado", not res.passed)
            rep.check("code min_grams", _has_code(res, Severity.HARD_FAIL, "min_grams"))

            # ---- part 2g: warnings do not break passing ----
            print("\nWarn. missing anthropometric data")
            bare = ClientProfile(id=-1, sex="F", age=None, height_cm=None,
                                 weight_kg=None, activity_level=None)
            # generate for the bare client so both sides use the same default
            # weight; otherwise a plan built for a lighter client trips the
            # protein range under the 70kg fallback.
            bare_plan = gen(bare, 3, 3, [], m3)
            res = val(bare_plan, bare, [])
            rep.check("passed pese al warning", res.passed,
                      f"findings={[f.code for f in res.findings]}")
            rep.check("code anthropometric_fallback",
                      _has_code(res, Severity.WARNING, "anthropometric_fallback"))

            print("\nWarn. solver warnings propagated")
            warned = copy.deepcopy(base)
            warned.warnings = ["Soft nutrient_ratio (id 5) is not modeled in this version."]
            res = val(warned, maria_c, [])
            rep.check("passed pese al warning", res.passed)
            rep.check("code solver_warning", _has_code(res, Severity.WARNING, "solver_warning"))

    print(f"\n== {rep.passed} PASS, {rep.failed} FAIL ==")
    return 0 if rep.failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
