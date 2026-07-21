"""The closed catalog the model is allowed to produce, as prompt text.

The model must map free text onto this vocabulary: it never invents a type nor a
code. Types mirror the manual form; tag and nutrient codes mirror the database
catalog (seed 0002). Foods have no short closed list, so they travel by name and
the resolver matches them against the visible food pool.

This keeps the model's job narrow: pick a type, pick a code from a menu, read
off a number. Everything checkable in code stays out of the model.
"""

from __future__ import annotations

# type -> one-line meaning, in the model's task language.
TYPE_MEANINGS: list[tuple[str, str]] = [
    ("kcal_target", "daily energy goal in kcal (value=kcal). Usually soft."),
    ("macro_target", "daily grams goal for a macronutrient (target_nutrient_code in {protein_g,carb_g,fat_g}, value=grams). Usually soft."),
    ("nutrient_min", "at least value of a nutrient per day (target_nutrient_code, value)."),
    ("nutrient_max", "at most value of a nutrient per day (target_nutrient_code, value)."),
    ("nutrient_ratio", "bound the ratio numerator/denominator (target_nutrient_code=numerator, denominator_nutrient_code, value=bound, ratio_bound=min|max)."),
    ("forbid_food", "a food never appears (target_food_name). Hard by default."),
    ("prefer_food", "favor a food (target_food_name, optional meal_type). Soft."),
    ("forbid_tag", "no food from a family/allergen/intolerance (target_tag_code). Hard by default; use for allergies and intolerances."),
    ("prefer_tag", "favor a food family (target_tag_code). Soft."),
    ("forbid_combination", "two items must not share a meal (target_food_name or target_tag_code, plus combine_with_food_name or combine_with_tag_code). Hard."),
    ("meal_kcal_ratio", "share of daily energy per meal (split: {meal_type_code: percent}, sum <= 100). Soft."),
    ("max_servings_per_period", "cap how often a food or family shows up in a window (target_food_name or target_tag_code, value=cap, window_days). Soft by default."),
    ("no_repeat_food", "minimum gap in days before a food repeats (target_food_name, value=days)."),
    ("no_repeat_tag", "minimum gap in days before a food family repeats (target_tag_code, value=days)."),
]

# tag codes grouped by kind, as in seed 0002.
TAG_CODES: dict[str, list[str]] = {
    "allergen": [
        "gluten", "milk_allergen", "eggs_allergen", "fish_allergen",
        "crustaceans", "mollusks_allergen", "tree_nuts", "peanuts", "soy",
    ],
    "intolerance": ["lactose", "fodmap_high"],
    "cultural": ["vegetarian", "vegan", "halal", "no_pork"],
    "clinical_marker": [
        "high_sodium", "high_potassium", "high_phosphorus", "high_gi",
    ],
    "processing": ["nova_4"],
}

# nutrient codes, as in seed 0002.
NUTRIENT_CODES: list[str] = [
    "energy_kcal", "protein_g", "carb_g", "fat_g", "sat_fat_g", "fiber_g",
    "sodium_mg", "sugar_added_g", "iron_mg", "calcium_mg", "vit_d_ug", "vit_b12_ug",
]

# meal_type codes, as in seed 0002.
MEAL_TYPE_CODES: list[str] = [
    "breakfast", "mid_morning", "lunch", "snack", "dinner", "late_snack",
]


def catalog_block() -> str:
    """The catalog section of the system prompt."""
    lines: list[str] = []
    lines.append("CONSTRAINT TYPES (use only these):")
    for name, meaning in TYPE_MEANINGS:
        lines.append(f"- {name}: {meaning}")

    lines.append("")
    lines.append("TAG CODES (use only these, pick the closest):")
    for kind, codes in TAG_CODES.items():
        lines.append(f"- {kind}: {', '.join(codes)}")

    lines.append("")
    lines.append("NUTRIENT CODES (use only these): " + ", ".join(NUTRIENT_CODES))
    lines.append("MEAL TYPE CODES: " + ", ".join(MEAL_TYPE_CODES))
    return "\n".join(lines)
