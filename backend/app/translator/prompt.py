"""System prompt and static few-shot for the translator.

Input is Spanish (a Spanish nutritionist writing in their own words), robust to
English; the output vocabulary (types and codes) is English, since it is the
catalog. The few-shot is fixed: the Maria/John/Emma examples reproduce the seed
0005 constraints, and the synthetic ones cover the types whose arguments live in
context (ratio, combination, meal split, servings cap). Learning a nutritionist
style is out of scope here.
"""

from __future__ import annotations

import json
from typing import Any, Optional

from .catalog_prompt import catalog_block

_ROLE = """You extract dietary constraints from what a nutritionist writes about a client, in Spanish or English.

Turn the text into a JSON object {"constraints": [...]}, one entry per distinct instruction. Rules:
- Use only the constraint types and codes from the catalog below. Never invent a type or a code.
- Tags and nutrients travel by code; foods travel by name (target_food_name), in the language of the text. When a rule is about a specific food (a serving cap, no-repeat, forbid, prefer), you MUST set target_food_name to that food; do not leave the item out.
- Allergies and intolerances are forbid_tag and hard. Preferences ("prefiere", "es vegetariana") are prefer_tag or prefer_food and soft.
- Fill only the fields a type needs. Leave the rest null.
- Whenever the text gives a number (kcal, grams, mg, servings, days, a ratio like "a third" = 0.33), you MUST put it in "value". Never emit a numeric constraint without its "value". kcal_target, macro_target, nutrient_min, nutrient_max, nutrient_ratio, max_servings_per_period and no_repeat_food always need "value".
- Read numbers as written. Do not judge whether a value is clinically sensible; translate it faithfully.
- If the text says nothing translatable, return an empty list."""


def _example(text: str, obj: dict[str, Any]) -> tuple[str, str]:
    return text, json.dumps(obj, ensure_ascii=False)


# Maria/John/Emma reproduce seed 0005; the rest cover context-bearing types.
FEW_SHOT: list[tuple[str, str]] = [
    _example(
        "Quiere perder peso, ponle unas 1500 kcal al dia y es vegetariana.",
        {
            "constraints": [
                {"type": "kcal_target", "priority": "soft", "weight": 7, "value": 1500},
                {"type": "prefer_tag", "priority": "soft", "weight": 4, "target_tag_code": "vegetarian"},
            ]
        },
    ),
    _example(
        "Busca ganar musculo, es alergico al cacahuete y quiero al menos 140 g de proteina al dia.",
        {
            "constraints": [
                {"type": "forbid_tag", "priority": "hard", "weight": 10, "target_tag_code": "peanuts"},
                {"type": "nutrient_min", "priority": "soft", "weight": 6, "target_nutrient_code": "protein_g", "value": 140},
            ]
        },
    ),
    _example(
        "Es diabetica e intolerante a la lactosa, y no pase de 2000 mg de sodio.",
        {
            "constraints": [
                {"type": "forbid_tag", "priority": "hard", "weight": 9, "target_tag_code": "lactose"},
                {"type": "nutrient_max", "priority": "soft", "weight": 7, "target_nutrient_code": "sodium_mg", "value": 2000},
            ]
        },
    ),
    _example(
        "El desayuno debe ser un 30% de las calorias y la comida un 40%.",
        {
            "constraints": [
                {"type": "meal_kcal_ratio", "priority": "soft", "weight": 5, "split": {"breakfast": 30, "lunch": 40}}
            ]
        },
    ),
    _example(
        "Que no repita el mismo pescado en 3 dias, como mucho salmon dos veces por semana.",
        {
            "constraints": [
                {"type": "no_repeat_tag", "priority": "soft", "weight": 5, "target_tag_code": "fish_allergen", "value": 3},
                {"type": "max_servings_per_period", "priority": "soft", "weight": 5, "target_food_name": "salmon", "value": 2, "window_days": 7},
            ]
        },
    ),
    _example(
        "El arroz como mucho tres veces por semana y nada de ternera.",
        {
            "constraints": [
                {"type": "max_servings_per_period", "priority": "soft", "weight": 5, "target_food_name": "arroz", "value": 3, "window_days": 7},
                {"type": "forbid_food", "priority": "hard", "weight": 8, "target_food_name": "ternera", "value": 0},
            ]
        },
    ),
    _example(
        "Que las grasas saturadas no superen un tercio de la grasa total.",
        {
            "constraints": [
                {"type": "nutrient_ratio", "priority": "soft", "weight": 5, "target_nutrient_code": "sat_fat_g", "denominator_nutrient_code": "fat_g", "value": 0.33, "ratio_bound": "max"}
            ]
        },
    ),
]


def build_system_prompt() -> str:
    parts = [_ROLE, "", catalog_block(), "", "EXAMPLES:"]
    for text, out in FEW_SHOT:
        parts.append(f"Input: {text}")
        parts.append(f"Output: {out}")
    return "\n".join(parts)


def build_user_prompt(text: str, client_context: Optional[dict[str, Any]] = None) -> str:
    lines = []
    if client_context:
        facts = ", ".join(f"{k}={v}" for k, v in client_context.items() if v is not None)
        if facts:
            lines.append(f"Client: {facts}")
    lines.append(f"Input: {text}")
    lines.append("Output:")
    return "\n".join(lines)
