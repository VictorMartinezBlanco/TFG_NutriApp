"""Output contract of the plan validator.

A ValidationResult carries a list of findings, an averaged plan summary for
context, and a derived pass flag. It is the validator's own contract, separate
from the solver PlanResult.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Severity(Enum):
    HARD_FAIL = "hard_fail"
    WARNING = "warning"


@dataclass(frozen=True)
class Location:
    """Element a finding points at. all fields None means plan-global."""

    day_num: Optional[int] = None
    meal_type_code: Optional[str] = None
    food_id: Optional[int] = None


@dataclass
class Finding:
    severity: Severity
    code: str
    message: str
    location: Location = field(default_factory=Location)


@dataclass
class PlanSummary:
    """Per-day means over the plan. informative, never a finding source."""

    kcal_mean: float
    protein_g_mean: float
    carb_g_mean: float
    fat_g_mean: float


@dataclass
class ValidationResult:
    findings: list[Finding]
    summary: PlanSummary
    passed: bool
