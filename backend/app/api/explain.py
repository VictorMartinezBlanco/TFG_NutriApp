"""Plain-language rendering of an infeasibility diagnosis.

The solver already isolates the conflicting constraints (the unsat core), but
its references carry catalog ids. This layer resolves those ids to real food,
tag and nutrient names and writes one sentence a nutritionist can act on. It
reads the core; it never touches how the solver computed it.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import asyncpg

from app.solver.types import ConstraintRef


@dataclass
class NameIndex:
    """Id to display-name maps for the ids a message needs to mention."""

    foods: dict[int, str] = field(default_factory=dict)
    tags: dict[int, str] = field(default_factory=dict)
    nutrients: dict[int, tuple[str, str]] = field(default_factory=dict)

    def food(self, fid: int) -> str:
        return self.foods.get(fid, f"food {fid}")

    def tag(self, tid: int) -> str:
        return self.tags.get(tid, f"food family {tid}")

    def nutrient(self, nid: int) -> tuple[str, str]:
        """(name, unit); falls back to a neutral label when unknown."""
        return self.nutrients.get(nid, (f"nutrient {nid}", ""))


async def load_name_index(
    conn: asyncpg.Connection,
    *,
    food_ids: set[int] = frozenset(),
    tag_ids: set[int] = frozenset(),
    nutrient_ids: set[int] = frozenset(),
) -> NameIndex:
    index = NameIndex()
    if food_ids:
        rows = await conn.fetch(
            "SELECT id, name_en FROM food WHERE id = ANY($1::int[])", list(food_ids)
        )
        index.foods = {r["id"]: r["name_en"] for r in rows}
    if tag_ids:
        rows = await conn.fetch(
            "SELECT id, name_en FROM tag WHERE id = ANY($1::int[])", list(tag_ids)
        )
        index.tags = {r["id"]: r["name_en"] for r in rows}
    if nutrient_ids:
        rows = await conn.fetch(
            "SELECT id, name_en, unit_default FROM nutrient WHERE id = ANY($1::int[])",
            list(nutrient_ids),
        )
        index.nutrients = {r["id"]: (r["name_en"], r["unit_default"]) for r in rows}
    return index


def ref_ids(refs: list[ConstraintRef]) -> tuple[set[int], set[int], set[int]]:
    foods = {r.target_food_id for r in refs if r.target_food_id is not None}
    tags = {r.target_tag_id for r in refs if r.target_tag_id is not None}
    nuts = {r.target_nutrient_id for r in refs if r.target_nutrient_id is not None}
    return foods, tags, nuts


def fmt_value(v: float | None) -> str:
    if v is None:
        return ""
    return str(int(v)) if float(v).is_integer() else f"{v:g}"


def nutrient_amount(names: NameIndex, nid: int, value: float | None) -> str:
    name, unit = names.nutrient(nid)
    amount = fmt_value(value)
    if amount and unit:
        return f"{amount} {unit} of {name.lower()}"
    if amount:
        return f"{amount} of {name.lower()}"
    return name.lower()


def describe_ref(r: ConstraintRef, names: NameIndex) -> str:
    if r.type == "kcal_target" and r.value is not None:
        return f"the {fmt_value(r.value)} kcal target"
    if r.type == "nutrient_min" and r.target_nutrient_id is not None:
        return f"the minimum of {nutrient_amount(names, r.target_nutrient_id, r.value)}"
    if r.type == "nutrient_max" and r.target_nutrient_id is not None:
        return f"the maximum of {nutrient_amount(names, r.target_nutrient_id, r.value)}"
    if r.type == "forbid_tag" and r.target_tag_id is not None:
        return f"excluding {names.tag(r.target_tag_id).lower()} foods"
    if r.type == "forbid_food" and r.target_food_id is not None:
        return f"excluding {names.food(r.target_food_id)}"
    if r.type == "max_servings_per_period" and r.target_food_id is not None:
        limit = fmt_value(r.value)
        return f"the limit of {limit} servings of {names.food(r.target_food_id)}"
    if r.type == "no_repeat_tag" and r.target_tag_id is not None:
        return f"the no-repeat rule for {names.tag(r.target_tag_id).lower()} foods"
    if r.type == "meal_kcal_ratio":
        return "the calorie split between meals"
    return r.type.replace("_", " ")


def explain_infeasible(core: list[ConstraintRef], names: NameIndex) -> str:
    """One sentence, real names, for the nutritionist to act on."""
    if not core:
        return (
            "No plan satisfies all the current constraints together, and no "
            "single culprit could be isolated. Try relaxing the strictest ones."
        )
    parts = [describe_ref(r, names) for r in core]
    if len(parts) == 1:
        return (
            f"No plan can satisfy {parts[0]} with the available foods. "
            "Consider relaxing it."
        )
    if len(parts) == 2:
        return (
            f"{parts[0].capitalize()} conflicts with {parts[1]}: no combination "
            "of the available foods satisfies both. Consider relaxing one of them."
        )
    listed = ", ".join(parts[:-1]) + f" and {parts[-1]}"
    return (
        f"These requirements cannot be met together: {listed}. "
        "Consider relaxing one of them."
    )
