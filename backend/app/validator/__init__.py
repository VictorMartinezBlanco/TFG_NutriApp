"""Deterministic validator for solver plans.

Audits a feasible plan with pure rules before the professional reviews it: it
never generates and never touches the database. validate_plan is the entry
point; its ValidationResult is the validator's own contract, separate from the
solver PlanResult.
"""

from __future__ import annotations

from app.solver import config as SC
from app.solver.model import daily_kcal_floor
from app.solver.types import ClientProfile, Constraint, FeasiblePlan, Food

from . import rules
from .recompute import DailyNutrients, recompute_plan
from .types import (
    Finding,
    Location,
    PlanSummary,
    Severity,
    ValidationResult,
)

__all__ = [
    "validate_plan",
    "ValidationResult", "Finding", "Location", "Severity", "PlanSummary",
]


def _summary(daily: list[DailyNutrients]) -> PlanSummary:
    n = len(daily) or 1

    def mean(code: str) -> float:
        return sum(d.totals.get(code, 0.0) for d in daily) / n

    return PlanSummary(
        kcal_mean=mean(SC.KCAL_CODE),
        protein_g_mean=mean(SC.PROTEIN_CODE),
        carb_g_mean=mean(SC.CARB_CODE),
        fat_g_mean=mean(SC.FAT_CODE),
    )


def _recompute_deviation_pct(daily: list[DailyNutrients], kcal_target: float) -> float:
    if kcal_target <= 0:
        return 0.0
    devs = [abs(d.totals.get(SC.KCAL_CODE, 0.0) - kcal_target) / kcal_target for d in daily]
    return sum(devs) / (len(devs) or 1) * 100


def validate_plan(
    plan: FeasiblePlan,
    client: ClientProfile,
    constraints: list[Constraint],
    *,
    food_index: dict[int, Food],
    nutrient_codes: dict[int, str],
    tag_members: dict[int, list[int]],
) -> ValidationResult:
    """Validate a feasible plan. pure over its arguments, no db access."""
    daily = recompute_plan(plan, food_index)
    findings: list[Finding] = []

    floor_warnings: list[str] = []
    floor = daily_kcal_floor(client, floor_warnings)
    for w in floor_warnings:
        findings.append(Finding(Severity.WARNING, "anthropometric_fallback", w))
    for w in plan.warnings:
        findings.append(Finding(Severity.WARNING, "solver_warning", w))

    # sanity check: the validator recompute should match the solver metric. a
    # large gap usually means a food_index other than the generation pool.
    kcal_target = next(
        (c.value for c in constraints if c.type == "kcal_target" and c.value is not None),
        None,
    )
    reported = plan.metrics.kcal_mean_deviation_pct
    if kcal_target is not None and reported is not None:
        mine = _recompute_deviation_pct(daily, kcal_target)
        if abs(mine - reported) > 1.0:
            findings.append(Finding(
                Severity.WARNING,
                "recompute_mismatch",
                f"Recomputed kcal deviation {mine:.1f}% differs from the solver {reported:.1f}%.",
            ))

    findings.extend(rules.check_kcal_floor(daily, floor))
    findings.extend(rules.check_protein_range(daily, client))
    findings.extend(rules.check_fat_min_energy(daily))
    findings.extend(rules.check_micro_toxicity(daily))
    findings.extend(rules.check_hard_constraints(
        plan, constraints, daily,
        food_index=food_index, nutrient_codes=nutrient_codes, tag_members=tag_members,
    ))
    findings.extend(rules.check_meal_structure(plan))
    findings.extend(rules.check_min_grams(plan))
    findings.extend(rules.check_serving_profile(plan, food_index))
    findings.extend(rules.check_slot_whitelist(plan, food_index))
    findings.extend(rules.check_main_meal_size(plan))
    findings.extend(rules.check_condiments(plan, food_index))
    findings.extend(rules.check_sweet_fruit_cap(plan, food_index))

    passed = not any(f.severity is Severity.HARD_FAIL for f in findings)
    return ValidationResult(findings=findings, summary=_summary(daily), passed=passed)
