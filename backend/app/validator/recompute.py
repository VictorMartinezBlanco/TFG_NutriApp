"""Deterministic nutrient recompute from the plan and the food pool.

Sums nutrients over the plan from the official per-100g composition, the same
value * grams / 100 the solver uses. A nutrient absent from a food contributes
zero.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.solver.types import Day, FeasiblePlan, Food


@dataclass
class DailyNutrients:
    """Recomputed totals for one day, by nutrient code."""

    day_num: int
    totals: dict[str, float] = field(default_factory=dict)
    by_meal: dict[str, dict[str, float]] = field(default_factory=dict)


def recompute_day(day: Day, food_index: dict[int, Food]) -> DailyNutrients:
    out = DailyNutrients(day_num=day.day_num)
    for meal in day.meals:
        meal_totals: dict[str, float] = {}
        for it in meal.items:
            food = food_index.get(it.food_id)
            if food is None:
                continue
            for code, per_100 in food.nutrients.items():
                add = per_100 * it.grams / 100
                meal_totals[code] = meal_totals.get(code, 0.0) + add
                out.totals[code] = out.totals.get(code, 0.0) + add
        out.by_meal[meal.meal_type_code] = meal_totals
    return out


def recompute_plan(plan: FeasiblePlan, food_index: dict[int, Food]) -> list[DailyNutrients]:
    return [recompute_day(d, food_index) for d in plan.days]


def pool_has_code(food_index: dict[int, Food], code: str) -> bool:
    """Whether any food carries this nutrient. mirrors the solver guard that
    skips a nutrient constraint on days where the code is not in the pool."""
    return any(code in f.nutrients for f in food_index.values())
