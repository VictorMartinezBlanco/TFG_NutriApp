"""Solver de planes nutricionales como problema de constraint programming.

Punto de entrada: generate_plan, una funcion pura que dado un cliente, la forma
del plan y un conjunto de restricciones ya estructuradas devuelve un borrador de
plan factible o un diagnostico de infactibilidad. No consulta ningun modelo de
lenguaje, no valida clinicamente y no persiste nada.
"""

from __future__ import annotations

from typing import Optional

from . import config as C
from .catalog import apply_constraints
from .model import build_base_model
from .objective import set_objective
from .result import solve
from .types import (
    ClientProfile,
    Constraint,
    ConstraintRef,
    Day,
    Food,
    FeasiblePlan,
    InfeasiblePlan,
    Meal,
    MealItem,
    PlanResult,
    SolveMetrics,
)
from .config import DEFAULT_WEIGHTS, ObjectiveWeights

__all__ = [
    "generate_plan",
    "ClientProfile", "Constraint", "Food", "PlanResult", "FeasiblePlan",
    "InfeasiblePlan", "Day", "Meal", "MealItem", "SolveMetrics", "ConstraintRef",
    "ObjectiveWeights", "DEFAULT_WEIGHTS",
]


def generate_plan(
    client: ClientProfile,
    duration_days: int,
    meals_per_day: int,
    constraints: list[Constraint],
    food_pool: list[Food],
    *,
    nutrient_codes: dict[int, str],
    meal_codes: list[str],
    weights: ObjectiveWeights = DEFAULT_WEIGHTS,
    time_limit_s: float = C.SOLVE_TIME_LIMIT_S,
) -> PlanResult:
    warnings: list[str] = []
    pm = build_base_model(
        client, duration_days, meals_per_day, food_pool, meal_codes, warnings
    )

    tag_members: dict[int, list[int]] = {}
    for f in food_pool:
        for tid in f.tag_ids:
            tag_members.setdefault(tid, []).append(f.id)

    applied = apply_constraints(
        pm, constraints,
        tag_members=tag_members,
        nutrient_codes=nutrient_codes,
        meal_codes=meal_codes,
        weights=weights,
    )
    set_objective(pm, applied.obj, weights)

    kcal_target = next(
        (c.value for c in constraints if c.type == "kcal_target" and c.priority == "soft"),
        None,
    )
    result = solve(pm, applied, meal_codes, kcal_target=kcal_target, time_limit_s=time_limit_s)

    if isinstance(result, FeasiblePlan):
        result.warnings = warnings + applied.warnings + result.warnings
    return result
