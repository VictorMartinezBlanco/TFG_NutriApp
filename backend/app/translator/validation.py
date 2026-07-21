"""Pure validation of a constraint draft.

Single source of truth for what a well-formed constraint looks like, shared by
the manual path (mirrored from the frontend contract) and the generation
service. Given a ConstraintIn with ids already resolved, it checks that the type
belongs to the closed catalog and that the fields each type requires are
present and coherent. No database, no LLM, no framework: it takes a ConstraintIn
and returns None or a legible reason.

The rules here match the manual producer of the 6b form: which target each type
needs, which arguments live in flat columns and which in context, the numeric
bounds. A draft that passes here is indistinguishable from a manually entered
one for the solver.
"""

from __future__ import annotations

from typing import Optional

from app.api.schemas import ConstraintIn

# The 15 optimizable types the solver knows, plus no_repeat_tag (added with the
# solver in 0009). meals_per_day and plan_duration_days are structural: they
# parameterize the solver call, they are not rows, so they are not translatable.
CATALOG_TYPES = frozenset(
    {
        "kcal_target",
        "macro_target",
        "nutrient_min",
        "nutrient_max",
        "nutrient_ratio",
        "forbid_food",
        "prefer_food",
        "forbid_tag",
        "prefer_tag",
        "forbid_combination",
        "meal_kcal_ratio",
        "max_servings_per_period",
        "no_repeat_food",
        "no_repeat_tag",
    }
)

_NEEDS_NUTRIENT = {"macro_target", "nutrient_min", "nutrient_max", "nutrient_ratio"}
_NEEDS_TAG = {"forbid_tag", "prefer_tag", "no_repeat_tag"}
_NEEDS_FOOD = {"forbid_food", "prefer_food", "no_repeat_food"}
_NEEDS_FOOD_OR_TAG = {"forbid_combination", "max_servings_per_period"}
_NEEDS_VALUE = {
    "kcal_target",
    "macro_target",
    "nutrient_min",
    "nutrient_max",
    "nutrient_ratio",
    "max_servings_per_period",
    "no_repeat_food",
    "no_repeat_tag",
}


def validate_draft(c: ConstraintIn) -> Optional[str]:
    """Return None when the draft is well-formed, else a legible reason."""
    if c.type not in CATALOG_TYPES:
        return f"Unknown constraint type '{c.type}'."
    if c.priority not in ("hard", "soft"):
        return "Priority must be hard or soft."
    if not (1 <= c.weight <= 10):
        return "Weight must be between 1 and 10."

    err = _check_target(c)
    if err:
        return err
    err = _check_value(c)
    if err:
        return err
    return _check_context(c)


def _check_target(c: ConstraintIn) -> Optional[str]:
    if c.type in _NEEDS_NUTRIENT and c.target_nutrient_id is None:
        return f"{c.type} requires a nutrient target."
    if c.type in _NEEDS_TAG and c.target_tag_id is None:
        return f"{c.type} requires a tag target."
    if c.type in _NEEDS_FOOD and c.target_food_id is None:
        return f"{c.type} requires a food target."
    if c.type in _NEEDS_FOOD_OR_TAG and c.target_food_id is None and c.target_tag_id is None:
        return f"{c.type} requires a food or tag target."
    return None


def _check_value(c: ConstraintIn) -> Optional[str]:
    if c.type in _NEEDS_VALUE:
        if c.value is None:
            return f"{c.type} requires a numeric value."
        if c.value < 0:
            return "The value cannot be negative."
    return None


def _check_context(c: ConstraintIn) -> Optional[str]:
    ctx = c.context or {}

    if c.type == "nutrient_ratio":
        denom = ctx.get("denominator_nutrient_id")
        if denom is None:
            return "nutrient_ratio requires a denominator nutrient."
        if denom == c.target_nutrient_id:
            return "Numerator and denominator must be different nutrients."

    if c.type == "forbid_combination":
        combine = ctx.get("combine_with") or {}
        if "food_id" not in combine and "tag_id" not in combine:
            return "forbid_combination requires a second item."
        if "food_id" in combine and combine["food_id"] == c.target_food_id:
            return "The two items of the combination must be different."
        if "tag_id" in combine and combine["tag_id"] == c.target_tag_id:
            return "The two items of the combination must be different."

    if c.type == "meal_kcal_ratio":
        split = ctx.get("split") or {}
        if not split:
            return "meal_kcal_ratio requires a share for at least one meal."
        total = 0.0
        for pct in split.values():
            if pct < 0 or pct > 100:
                return "Each meal share must be between 0 and 100."
            total += pct
        if total > 100:
            return "The meal shares add up to more than 100%."

    if c.type == "max_servings_per_period":
        window = ctx.get("window_days")
        if window is not None and window < 1:
            return "The window must be at least 1 day."

    if c.type in ("no_repeat_food", "no_repeat_tag"):
        if c.value is not None and c.value < 1:
            return "The minimum gap must be at least 1 day."

    return None
