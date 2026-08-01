"""Audits every generated plan for food-level plausibility.

Walks all live plans and reports, per section, the facts a human needs to judge
whether the plans make culinary sense: serving sizes per food, meals with a
single item, meals made only of unaccompanied fats or nuts, which foods land in
which meal slot, fruit pile-ups and per-meal energy. The judgment itself lives
in the phase 0 catalog document; this script only measures.

Flag thresholds below are audit heuristics to surface candidates for review,
not model constants.

Run:  python -m scripts.audit_plans [min_plan_id]

The optional min_plan_id scopes the audit to plans with id >= N, to measure a
regenerated batch without the legacy plans that predate the plausibility layer.
"""

from __future__ import annotations

import asyncio
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from statistics import median

from app.db import connection_pool

FLAG_SMALL_G = 25.0
FLAG_LARGE_G = 250.0
FLAG_MEAL_KCAL_LOW = 150.0
MEAL_ORDER = ["breakfast", "mid_morning", "lunch", "snack", "dinner", "late_snack"]
MAIN_MEALS = {"breakfast", "lunch", "dinner"}


@dataclass
class Item:
    plan_id: int
    client: str
    day: int
    meal: str
    food_id: int
    food: str
    family: str
    grams: float
    kcal_100g: float

    @property
    def kcal(self) -> float:
        return self.grams * self.kcal_100g / 100.0


@dataclass
class FoodStats:
    name: str
    family: str
    grams: list[float] = field(default_factory=list)
    by_meal: dict[str, int] = field(default_factory=lambda: defaultdict(int))


async def _load_items(min_plan_id: int = 0) -> tuple[list[Item], dict[int, dict]]:
    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            plans = await conn.fetch(
                """
                SELECT p.id, p.duration_days, p.approved_at,
                       c.full_name_pseudonym AS client
                FROM plan p JOIN client c ON c.id = p.client_id
                WHERE p.deleted_at IS NULL AND p.id >= $1
                ORDER BY p.id
                """,
                min_plan_id,
            )
            rows = await conn.fetch(
                """
                SELECT i.plan_id, i.day_num, mt.code AS meal, i.food_id,
                       f.name_es AS food, i.quantity_g,
                       COALESCE(tf.code, '(none)') AS family,
                       COALESCE(fn.value_per_100g, 0) AS kcal_100g
                FROM plan_meal_item i
                JOIN plan p ON p.id = i.plan_id AND p.deleted_at IS NULL
                JOIN meal_type mt ON mt.id = i.meal_type_id
                JOIN food f ON f.id = i.food_id
                LEFT JOIN LATERAL (
                    SELECT t.code FROM food_tag ft
                    JOIN tag t ON t.id = ft.tag_id AND t.kind = 'family'
                    WHERE ft.food_id = f.id
                    LIMIT 1
                ) tf ON true
                LEFT JOIN food_nutrient fn ON fn.food_id = f.id
                    AND fn.nutrient_id = (SELECT id FROM nutrient WHERE code = 'energy_kcal')
                WHERE i.food_id IS NOT NULL AND i.plan_id >= $1
                ORDER BY i.plan_id, i.day_num, mt.default_order, i.item_order
                """,
                min_plan_id,
            )
    plan_info = {
        p["id"]: {"client": p["client"], "days": p["duration_days"],
                  "signed": p["approved_at"] is not None}
        for p in plans
    }
    items = [
        Item(
            plan_id=r["plan_id"],
            client=plan_info[r["plan_id"]]["client"],
            day=r["day_num"],
            meal=r["meal"],
            food_id=r["food_id"],
            food=r["food"],
            family=r["family"],
            grams=float(r["quantity_g"]),
            kcal_100g=float(r["kcal_100g"]),
        )
        for r in rows
    ]
    return items, plan_info


def _section(title: str) -> None:
    print(f"\n=== {title} ===")


def main_report(items: list[Item], plan_info: dict[int, dict]) -> None:
    _section("plans audited")
    per_plan = defaultdict(int)
    for it in items:
        per_plan[it.plan_id] += 1
    for pid, info in plan_info.items():
        status = "signed" if info["signed"] else "draft"
        print(f"  plan {pid:>3}  {info['client']:<22} {info['days']}d  "
              f"{status:<6} {per_plan[pid]} items")
    print(f"  total: {len(plan_info)} plans, {len(items)} items")

    _section("serving size per food (appearances, min/median/max grams)")
    foods: dict[int, FoodStats] = {}
    for it in items:
        st = foods.setdefault(it.food_id, FoodStats(name=it.food, family=it.family))
        st.grams.append(it.grams)
        st.by_meal[it.meal] += 1
    for fid, st in sorted(foods.items(), key=lambda kv: kv[1].name):
        g = st.grams
        print(f"  {st.name:<28} {st.family:<15} n={len(g):>4}  "
              f"min={min(g):>5.0f}  med={median(g):>5.0f}  max={max(g):>5.0f}")

    _section("items pinned to the global limits")
    at_floor = sum(1 for it in items if it.grams <= 10.0)
    at_ceil = sum(1 for it in items if it.grams >= 295.0)
    n = len(items)
    print(f"  at the 10 g floor:    {at_floor:>4} of {n} ({100 * at_floor / n:.1f}%)")
    print(f"  at the 300 g ceiling: {at_ceil:>4} of {n} ({100 * at_ceil / n:.1f}%)")

    _section(f"items at extreme servings (<= {FLAG_SMALL_G:.0f} g or >= {FLAG_LARGE_G:.0f} g)")
    small = [it for it in items if it.grams <= FLAG_SMALL_G]
    large = [it for it in items if it.grams >= FLAG_LARGE_G]
    print(f"  small: {len(small)} items, large: {len(large)} items")
    for it in sorted(small, key=lambda x: x.grams)[:40]:
        print(f"    plan {it.plan_id} {it.client} d{it.day} {it.meal:<11} "
              f"{it.food:<28} {it.grams:>5.0f} g")
    for it in sorted(large, key=lambda x: -x.grams)[:40]:
        print(f"    plan {it.plan_id} {it.client} d{it.day} {it.meal:<11} "
              f"{it.food:<28} {it.grams:>5.0f} g")

    meals: dict[tuple[int, int, str], list[Item]] = defaultdict(list)
    for it in items:
        meals[(it.plan_id, it.day, it.meal)].append(it)

    _section("single-item meals")
    singles = {k: v for k, v in meals.items() if len(v) == 1}
    print(f"  {len(singles)} of {len(meals)} meals have a single item")
    for (pid, day, meal), v in sorted(singles.items()):
        it = v[0]
        print(f"    plan {pid} {it.client} d{day} {meal:<11} "
              f"{it.food:<28} {it.grams:>5.0f} g  ({it.kcal:>4.0f} kcal)")

    _section("meals made only of no-family foods (fats, nuts, condiments)")
    lonely = {k: v for k, v in meals.items() if all(i.family == "(none)" for i in v)}
    print(f"  {len(lonely)} meals")
    for (pid, day, meal), v in sorted(lonely.items()):
        names = ", ".join(f"{i.food} {i.grams:.0f}g" for i in v)
        print(f"    plan {pid} {v[0].client} d{day} {meal:<11} {names}")

    _section("food x meal slot (appearances per slot)")
    header = " ".join(f"{m[:5]:>6}" for m in MEAL_ORDER)
    print(f"  {'food':<28} {'family':<15} {header}")
    for fid, st in sorted(foods.items(), key=lambda kv: (kv[1].family, kv[1].name)):
        counts = " ".join(f"{st.by_meal.get(m, 0):>6}" for m in MEAL_ORDER)
        print(f"  {st.name:<28} {st.family:<15} {counts}")

    _section("fruit pile-ups (meals with more than one fruit)")
    piled = {k: [i for i in v if i.family == "fruit"]
             for k, v in meals.items()
             if sum(1 for i in v if i.family == "fruit") > 1}
    print(f"  {len(piled)} meals")
    for (pid, day, meal), v in sorted(piled.items()):
        names = ", ".join(f"{i.food} {i.grams:.0f}g" for i in v)
        print(f"    plan {pid} {v[0].client} d{day} {meal:<11} {names}")

    _section("fruit as the whole main meal")
    fruit_only = {
        k: v for k, v in meals.items()
        if k[2] in MAIN_MEALS and v and all(i.family == "fruit" for i in v)
    }
    print(f"  {len(fruit_only)} meals")
    for (pid, day, meal), v in sorted(fruit_only.items()):
        names = ", ".join(f"{i.food} {i.grams:.0f}g" for i in v)
        print(f"    plan {pid} {v[0].client} d{day} {meal:<11} {names}")

    _section(f"low-energy meals (< {FLAG_MEAL_KCAL_LOW:.0f} kcal)")
    low = {k: v for k, v in meals.items()
           if sum(i.kcal for i in v) < FLAG_MEAL_KCAL_LOW}
    print(f"  {len(low)} of {len(meals)} meals")
    for (pid, day, meal), v in sorted(low.items(), key=lambda kv: sum(i.kcal for i in kv[1])):
        total = sum(i.kcal for i in v)
        names = ", ".join(f"{i.food} {i.grams:.0f}g" for i in v)
        print(f"    plan {pid} {v[0].client} d{day} {meal:<11} {total:>4.0f} kcal  {names}")

    _section("no-family foods repeated within one day (condiment overuse)")
    per_day: dict[tuple[int, int, int], int] = defaultdict(int)
    names_by_food: dict[int, str] = {}
    for it in items:
        if it.family == "(none)":
            per_day[(it.plan_id, it.day, it.food_id)] += 1
            names_by_food[it.food_id] = it.food
    over = {k: n for k, n in per_day.items() if n > 1}
    print(f"  {len(over)} food-days")
    for (pid, day, fid), n in sorted(over.items()):
        print(f"    plan {pid} d{day} {names_by_food[fid]:<28} x{n}")


async def main() -> None:
    min_plan_id = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    items, plan_info = await _load_items(min_plan_id)
    main_report(items, plan_info)


if __name__ == "__main__":
    asyncio.run(main())
