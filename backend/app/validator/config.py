"""Safety thresholds owned by the validator.

These are validation ceilings, not model parameters, so they live here and not
in the solver config. The physiological ranges the validator shares with the
solver (calorie floor, protein per kg, fat minimum) come from app.solver.config.
"""

from __future__ import annotations

# daily upper limits above which a nutrient becomes unsafe without supervision.
# adult reference tolerable upper intakes, orienting values; the professional
# stays responsible. flagged as warnings because the solver does not cap these,
# so a valid solver plan may cross them.
MICRO_TOXICITY_LIMITS: dict[str, float] = {
    "sodium_mg": 5000.0,
    "iron_mg": 45.0,
    "calcium_mg": 2500.0,
    "vit_d_ug": 100.0,
}

# the solver works in integer scale and the plan carries integer grams, so a
# float recompute can drift slightly from an exact target. margin for equality
# and bound comparisons, not a clinical criterion.
QUANT_TOL_PCT = 1.0
