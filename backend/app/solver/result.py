"""Resolucion del modelo y extraccion del resultado.

Corre CP-SAT sobre el modelo construido y devuelve un FeasiblePlan con su plan y
sus metricas, o un InfeasiblePlan con el nucleo de restricciones en conflicto,
reconstruido a partir de los literales de asuncion que devuelve el solver.
"""

from __future__ import annotations

from ortools.sat.python import cp_model

from . import config as C
from .catalog import Applied
from .model import PlanModel, scale_target
from .types import (
    ConstraintRef,
    Day,
    FeasiblePlan,
    InfeasiblePlan,
    Meal,
    MealItem,
    PlanResult,
    SolveMetrics,
)


def solve(
    pm: PlanModel,
    applied: Applied,
    meal_codes: list[str],
    *,
    kcal_target: float | None,
    time_limit_s: float = C.SOLVE_TIME_LIMIT_S,
) -> PlanResult:
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_s
    solver.parameters.relative_gap_limit = C.SOLVE_RELATIVE_GAP
    solver.parameters.num_search_workers = 8
    status = solver.Solve(pm.model)

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return _extract_plan(pm, applied, solver, status, meal_codes, kcal_target)

    if status == cp_model.INFEASIBLE:
        return _extract_infeasible(pm, applied, solver)

    # unknown / model invalid: sin solucion dentro del limite.
    return InfeasiblePlan(
        unsat_core=[],
        suggestion="The solver could not find a solution within the time limit.",
        relaxable=[],
    )


def _extract_plan(pm, applied, solver, status, meal_codes, kcal_target) -> FeasiblePlan:
    days: list[Day] = []
    for d in pm.days:
        meals: list[Meal] = []
        for mi, m in enumerate(pm.meals):
            items = []
            for f in pm.foods:
                if solver.Value(pm.x[(f.id, d, m)]) == 1:
                    grams = solver.Value(pm.g[(f.id, d, m)])
                    if grams > 0:
                        items.append(MealItem(food_id=f.id, grams=int(grams)))
            code = meal_codes[mi] if mi < len(meal_codes) else f"meal_{m}"
            meals.append(Meal(meal_type_code=code, items=items))
        days.append(Day(day_num=d, meals=meals))

    metrics = _metrics(pm, applied, solver, status, kcal_target)
    warnings = _soft_warnings(applied, solver)
    return FeasiblePlan(days=days, metrics=metrics, warnings=warnings)


def _metrics(pm, applied, solver, status, kcal_target) -> SolveMetrics:
    n_soft = len(applied.obj.soft_devs)
    satisfied = 0
    for _, dev in applied.obj.soft_devs:
        if solver.Value(dev) == 0:
            satisfied += 1
    soft_pct = 100.0 * satisfied / n_soft if n_soft else 100.0

    kcal_dev_pct = None
    if kcal_target:
        target = scale_target(kcal_target)
        devs = []
        for d in pm.days:
            dv = pm.daily_nut.get((d, C.KCAL_CODE))
            if dv is None:
                continue
            achieved = solver.Value(dv)
            devs.append(abs(achieved - target) / target * 100 if target else 0.0)
        if devs:
            kcal_dev_pct = round(sum(devs) / len(devs), 2)

    obj_val = None
    gap = None
    try:
        obj_val = int(solver.ObjectiveValue())
        best = solver.BestObjectiveBound()
        if obj_val:
            gap = round(abs(obj_val - best) / abs(obj_val), 4)
        else:
            gap = 0.0
    except Exception:
        pass

    return SolveMetrics(
        solve_status="optimal" if status == cp_model.OPTIMAL else "feasible",
        solve_time_ms=int(solver.WallTime() * 1000),
        hard_satisfied_pct=100.0,
        soft_satisfied_pct=round(soft_pct, 1),
        objective_value=obj_val,
        optimality_gap=gap,
        kcal_mean_deviation_pct=kcal_dev_pct,
    )


def _soft_warnings(applied, solver) -> list[str]:
    out = []
    for c, dev in applied.obj.soft_devs:
        if solver.Value(dev) > 0:
            out.append(f"Soft constraint {c.type} (id {c.id}) not fully met.")
    return out


def _extract_infeasible(pm, applied, solver) -> InfeasiblePlan:
    core_refs: list[ConstraintRef] = []
    for lit in solver.SufficientAssumptionsForInfeasibility():
        # el solver devuelve indices de variable; se mapean a su literal.
        for assume_lit, ref in applied.assumptions.items():
            if assume_lit.Index() == lit:
                core_refs.append(ref)
                break

    if not core_refs:
        # fallback: todas las duras si el solver no aisla el nucleo.
        core_refs = list(applied.assumptions.values())

    relaxable = [
        ConstraintRef(id=r.id, type=r.type, value=r.value, priority=r.priority,
                      target_nutrient_id=r.target_nutrient_id,
                      target_tag_id=r.target_tag_id, target_food_id=r.target_food_id)
        for r in core_refs
    ]
    return InfeasiblePlan(
        unsat_core=core_refs,
        suggestion=_suggestion(core_refs),
        relaxable=relaxable,
    )


def _suggestion(refs: list[ConstraintRef]) -> str:
    if not refs:
        return "The constraints are inconsistent, but no minimal core was isolated."
    parts: list[str] = []
    forbid_tags = sum(1 for r in refs if r.type == "forbid_tag")
    forbid_foods = sum(1 for r in refs if r.type == "forbid_food")
    for r in refs:
        if r.type == "kcal_target" and r.value is not None:
            parts.append(f"a {int(r.value)} kcal target")
        elif r.type == "nutrient_min" and r.value is not None:
            parts.append(f"a minimum of {int(r.value)} for a nutrient")
        elif r.type == "nutrient_max" and r.value is not None:
            parts.append(f"a maximum of {int(r.value)} for a nutrient")
    if forbid_tags:
        parts.append(
            f"{forbid_tags} forbidden food families" if forbid_tags > 1
            else "a forbidden food family"
        )
    if forbid_foods:
        parts.append(
            f"{forbid_foods} forbidden foods" if forbid_foods > 1
            else "a forbidden food"
        )
    for r in refs:
        if r.type not in ("kcal_target", "nutrient_min", "nutrient_max",
                          "forbid_tag", "forbid_food"):
            parts.append(r.type)
    listed = ", ".join(parts)
    return (
        f"These constraints cannot be satisfied together: {listed}. "
        "Consider relaxing one of them or lowering its bound."
    )
