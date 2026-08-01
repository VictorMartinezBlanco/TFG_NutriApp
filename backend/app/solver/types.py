"""Tipos de entrada y salida del solver.

La entrada (ClientProfile, Constraint, Food) es la forma en memoria de las filas
de la base de datos. La salida (PlanResult = FeasiblePlan | InfeasiblePlan) es la
estructura serializable que la capa de escritura materializa y que el endpoint
del 6e expondra por HTTP.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional, Union


@dataclass
class ClientProfile:
    id: int
    sex: Optional[str]              # 'M' | 'F' | 'X'
    age: Optional[int]
    height_cm: Optional[float]
    weight_kg: Optional[float]
    activity_level: Optional[str]


@dataclass
class Constraint:
    """Una fila de diet_constraint en su forma en memoria."""

    id: int
    type: str
    priority: str                   # 'hard' | 'soft'
    weight: int
    operator: Optional[str] = None
    value: Optional[float] = None
    value2: Optional[float] = None
    target_food_id: Optional[int] = None
    target_tag_id: Optional[int] = None
    target_nutrient_id: Optional[int] = None
    context: dict[str, Any] = field(default_factory=dict)


@dataclass
class Food:
    id: int
    name: str
    typical_serving_g: Optional[float]
    # perfil de racion: gramos por aparicion y gramos por unidad si el
    # alimento se sirve por piezas. None = usar los fallbacks globales.
    min_serving_g: Optional[float] = None
    max_serving_g: Optional[float] = None
    grams_per_unit: Optional[float] = None
    # composicion por 100 g, por code de nutriente.
    nutrients: dict[str, float] = field(default_factory=dict)
    tag_ids: set[int] = field(default_factory=set)
    # codes de los tags, para las reglas que razonan por vocabulario (roles
    # condiment/sweet, familia fruit, franjas moment_*).
    tag_codes: set[str] = field(default_factory=set)


@dataclass
class MealItem:
    food_id: int
    grams: int


@dataclass
class Meal:
    meal_type_code: str
    items: list[MealItem]


@dataclass
class Day:
    day_num: int
    meals: list[Meal]


@dataclass
class SolveMetrics:
    solve_status: str               # optimal | feasible | infeasible | unknown
    solve_time_ms: int
    hard_satisfied_pct: float
    soft_satisfied_pct: float
    objective_value: Optional[int]
    optimality_gap: Optional[float]
    kcal_mean_deviation_pct: Optional[float]


@dataclass
class FeasiblePlan:
    days: list[Day]
    metrics: SolveMetrics
    warnings: list[str] = field(default_factory=list)


@dataclass
class ConstraintRef:
    """Referencia a una restriccion, para el nucleo de infactibilidad."""

    id: Optional[int]
    type: str
    priority: Optional[str] = None
    value: Optional[float] = None
    target_food_id: Optional[int] = None
    target_tag_id: Optional[int] = None
    target_nutrient_id: Optional[int] = None


@dataclass
class InfeasiblePlan:
    unsat_core: list[ConstraintRef]
    suggestion: str
    relaxable: list[ConstraintRef] = field(default_factory=list)


PlanResult = Union[FeasiblePlan, InfeasiblePlan]
