"""Request and response models of the generation endpoint.

These mirror the JSON contract: the request identifies a client, the plan shape
and any extra constraints; the response is either a feasible plan with its
metrics, validation and unified findings, or an infeasible diagnosis with its
conflict core and a suggestion.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class ConstraintIn(BaseModel):
    """A constraint sent in the request body, in its serializable form.

    Targets travel by id, never by free text. The row id is optional here: the
    caller does not know it for constraints that are not stored yet, so the
    service assigns a synthetic one.
    """

    type: str
    priority: Literal["hard", "soft"]
    weight: int = 5
    operator: Optional[str] = None
    value: Optional[float] = None
    value2: Optional[float] = None
    target_food_id: Optional[int] = None
    target_tag_id: Optional[int] = None
    target_nutrient_id: Optional[int] = None
    context: dict[str, Any] = Field(default_factory=dict)


class GenerateRequest(BaseModel):
    nutritionist_id: str
    client_id: int
    duration_days: int = Field(ge=1, le=90)
    meals_per_day: int = Field(ge=1, le=6)
    constraints: list[ConstraintIn] = Field(default_factory=list)
    weights: Optional[dict[str, int]] = None
    # when false the plan is generated and returned but not written. the frontend
    # leaves it true so a single call generates, validates and persists a draft.
    persist: bool = True


class MealItemOut(BaseModel):
    food_id: int
    grams: int


class MealOut(BaseModel):
    meal_type_code: str
    items: list[MealItemOut]


class DayOut(BaseModel):
    day_num: int
    meals: list[MealOut]


class PlanOut(BaseModel):
    duration_days: int
    meals_per_day: int
    days: list[DayOut]


class MetricsOut(BaseModel):
    solve_status: str
    solve_time_ms: int
    hard_satisfied_pct: float
    soft_satisfied_pct: float
    objective_value: Optional[int]
    optimality_gap: Optional[float]
    kcal_mean_deviation_pct: Optional[float]


class SummaryOut(BaseModel):
    kcal_mean: float
    protein_g_mean: float
    carb_g_mean: float
    fat_g_mean: float


class ValidationOut(BaseModel):
    passed: bool
    summary: SummaryOut


class FindingOut(BaseModel):
    """A single note about the plan, from either engine.

    source tells the caller which engine raised it; severity is 'warning' for
    solver notes and either 'warning' or 'hard_fail' for validator ones.
    """

    source: Literal["solver", "validator"]
    severity: Literal["warning", "hard_fail"]
    code: str
    message: str
    day_num: Optional[int] = None
    meal_type_code: Optional[str] = None
    food_id: Optional[int] = None


class FeasibleResponse(BaseModel):
    status: Literal["feasible"] = "feasible"
    plan_id: Optional[int] = None
    plan: PlanOut
    metrics: MetricsOut
    validation: ValidationOut
    findings: list[FindingOut]


class ConstraintRefOut(BaseModel):
    type: str
    priority: Optional[str] = None
    value: Optional[float] = None
    target_food_id: Optional[int] = None
    target_tag_id: Optional[int] = None
    target_nutrient_id: Optional[int] = None


class InfeasibleResponse(BaseModel):
    status: Literal["infeasible"] = "infeasible"
    unsat_core: list[ConstraintRefOut]
    suggestion: str
    relaxable: list[ConstraintRefOut]


class SignResponse(BaseModel):
    plan_id: int
    status: Literal["signed", "already_signed"]
    approved_at: Optional[str] = None
