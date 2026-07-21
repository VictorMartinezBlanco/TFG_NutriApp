"""Raw LLM output schema.

The model does not know database ids, so targets travel by code (tags,
nutrients) or by free name (foods). A deterministic layer turns these into a
ConstraintIn with resolved ids. This is also the JSON schema handed to Ollama
so it constrains generation to this shape.

Everything past `type` and `priority` is optional: each constraint type fills a
different subset, and the fields it must fill are checked later by the
validation layer, not here. Keeping the schema permissive means a missing field
becomes a legible rejection instead of a generation failure.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class LlmConstraint(BaseModel):
    type: str
    priority: Literal["hard", "soft"]
    weight: int = 5

    # numeric argument (kcal, grams, servings, ratio, gap in days...).
    value: Optional[float] = Field(
        default=None,
        description="Numeric amount stated in the text: kcal, grams, mg, "
        "servings, days, or a ratio. Required for numeric constraint types.",
    )
    value2: Optional[float] = None

    # targets by code or name; the resolver maps them to ids.
    target_tag_code: Optional[str] = None
    target_nutrient_code: Optional[str] = None
    target_food_name: Optional[str] = None

    # context fields, flattened so the model fills only what applies.
    denominator_nutrient_code: Optional[str] = None
    ratio_bound: Optional[Literal["min", "max"]] = None
    meal_type: Optional[str] = None
    window_days: Optional[int] = None
    granularity: Optional[Literal["day", "meal"]] = None
    # meal_kcal_ratio: share per meal_type code, percentages.
    split: Optional[dict[str, float]] = None
    # forbid_combination: the second item, by code or name.
    combine_with_food_name: Optional[str] = None
    combine_with_tag_code: Optional[str] = None


class LlmTranslation(BaseModel):
    """Top-level object the model returns: a list of extracted constraints."""

    constraints: list[LlmConstraint] = Field(default_factory=list)


def ollama_format_schema() -> dict[str, Any]:
    """JSON schema passed to Ollama's structured output `format` field.

    Local models under `format` tend to skip fields the schema marks optional,
    and value is the one they drop most (a nutrient_min with no number is
    useless). So the schema handed to the model forces value to a number and
    lists it as required, which makes the model always read the amount off the
    text. The parsing schema stays permissive: for the non-numeric types the
    model fills a throwaway value that the validation layer ignores.
    """
    schema = LlmTranslation.model_json_schema()
    item = schema["$defs"]["LlmConstraint"]
    item["properties"]["value"] = {
        "type": "number",
        "description": "Numeric amount stated in the text: kcal, grams, mg, "
        "servings, days, or a ratio. Put 0 only when the type carries no number.",
    }
    item["required"] = ["type", "priority", "value"]
    return schema
