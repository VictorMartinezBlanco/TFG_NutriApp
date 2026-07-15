"""Serialization from the engine dataclasses to the response contract.

Pure functions: they read the solver PlanResult and the validator
ValidationResult and build the response models. The only non-trivial part is
merging the solver warnings and the validator findings into a single list
tagged by source, which is where they meet for the consumer.
"""

from __future__ import annotations

from app.solver.types import (
    ConstraintRef,
    FeasiblePlan,
    InfeasiblePlan,
)
from app.validator.types import Severity, ValidationResult

from .schemas import (
    ConstraintRefOut,
    DayOut,
    FeasibleResponse,
    FindingOut,
    InfeasibleResponse,
    MealItemOut,
    MealOut,
    MetricsOut,
    PlanOut,
    SummaryOut,
    ValidationOut,
)

# validator findings that just echo a solver warning; skipped so the solver list
# is not counted twice.
_SOLVER_ECHO_CODES = {"solver_warning"}


def _plan_out(plan: FeasiblePlan, duration_days: int, meals_per_day: int) -> PlanOut:
    days = [
        DayOut(
            day_num=d.day_num,
            meals=[
                MealOut(
                    meal_type_code=m.meal_type_code,
                    items=[MealItemOut(food_id=it.food_id, grams=it.grams) for it in m.items],
                )
                for m in d.meals
            ],
        )
        for d in plan.days
    ]
    return PlanOut(duration_days=duration_days, meals_per_day=meals_per_day, days=days)


def _metrics_out(plan: FeasiblePlan) -> MetricsOut:
    m = plan.metrics
    return MetricsOut(
        solve_status=m.solve_status,
        solve_time_ms=m.solve_time_ms,
        hard_satisfied_pct=m.hard_satisfied_pct,
        soft_satisfied_pct=m.soft_satisfied_pct,
        objective_value=m.objective_value,
        optimality_gap=m.optimality_gap,
        kcal_mean_deviation_pct=m.kcal_mean_deviation_pct,
    )


def _findings_out(plan: FeasiblePlan, validation: ValidationResult) -> list[FindingOut]:
    out: list[FindingOut] = []
    for w in plan.warnings:
        out.append(FindingOut(source="solver", severity="warning", code="soft_constraint", message=w))
    for f in validation.findings:
        if f.code in _SOLVER_ECHO_CODES:
            continue
        sev = "hard_fail" if f.severity is Severity.HARD_FAIL else "warning"
        out.append(FindingOut(
            source="validator",
            severity=sev,
            code=f.code,
            message=f.message,
            day_num=f.location.day_num,
            meal_type_code=f.location.meal_type_code,
            food_id=f.location.food_id,
        ))
    # hard fails first, then the rest, so the caller can lead with what matters.
    out.sort(key=lambda x: 0 if x.severity == "hard_fail" else 1)
    return out


def feasible_response(
    plan: FeasiblePlan,
    validation: ValidationResult,
    duration_days: int,
    meals_per_day: int,
    plan_id: int | None,
) -> FeasibleResponse:
    s = validation.summary
    return FeasibleResponse(
        plan_id=plan_id,
        plan=_plan_out(plan, duration_days, meals_per_day),
        metrics=_metrics_out(plan),
        validation=ValidationOut(
            passed=validation.passed,
            summary=SummaryOut(
                kcal_mean=round(s.kcal_mean, 1),
                protein_g_mean=round(s.protein_g_mean, 1),
                carb_g_mean=round(s.carb_g_mean, 1),
                fat_g_mean=round(s.fat_g_mean, 1),
            ),
        ),
        findings=_findings_out(plan, validation),
    )


def _ref_out(r: ConstraintRef) -> ConstraintRefOut:
    return ConstraintRefOut(
        type=r.type,
        priority=r.priority,
        value=r.value,
        target_food_id=r.target_food_id,
        target_tag_id=r.target_tag_id,
        target_nutrient_id=r.target_nutrient_id,
    )


def infeasible_response(result: InfeasiblePlan) -> InfeasibleResponse:
    return InfeasibleResponse(
        unsat_core=[_ref_out(r) for r in result.unsat_core],
        suggestion=result.suggestion,
        relaxable=[_ref_out(r) for r in result.relaxable],
    )
