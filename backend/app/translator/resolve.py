"""Deterministic layer: codes and names to ids.

The model produces codes (tags, nutrients) and names (foods); the solver
consumes ids. This layer closes that gap against the real catalog, and along
the way turns a raw LlmConstraint into a ConstraintIn with its context
assembled. Anything the model got wrong (a code not in the catalog, a food name
that matches nothing) surfaces here as a resolution failure, not as a bad row
reaching the solver.

Tag, nutrient and meal_type codes resolve against fixed catalogs; foods resolve
by name against the pool visible to the nutritionist (globals plus their own),
the same visibility the food search uses.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import asyncpg

from app.api.schemas import ConstraintIn

from .schema import LlmConstraint


class ResolutionError(Exception):
    """A code or name could not be resolved against the catalog."""


@dataclass
class Catalog:
    """Code -> id maps for the closed catalogs, loaded once per translation."""

    tags: dict[str, int]
    nutrients: dict[str, int]

    def tag_id(self, code: Optional[str]) -> Optional[int]:
        if code is None:
            return None
        if code not in self.tags:
            raise ResolutionError(f"Unknown tag code '{code}'.")
        return self.tags[code]

    def nutrient_id(self, code: Optional[str]) -> Optional[int]:
        if code is None:
            return None
        if code not in self.nutrients:
            raise ResolutionError(f"Unknown nutrient code '{code}'.")
        return self.nutrients[code]


async def load_catalog(conn: asyncpg.Connection) -> Catalog:
    tag_rows = await conn.fetch("SELECT id, code FROM tag")
    nut_rows = await conn.fetch("SELECT id, code FROM nutrient")
    return Catalog(
        tags={r["code"]: r["id"] for r in tag_rows},
        nutrients={r["code"]: r["id"] for r in nut_rows},
    )


async def resolve_food_name(
    conn: asyncpg.Connection, name: str, nutritionist_id: Optional[str]
) -> int:
    """Resolve a food name to an id within the nutritionist's visible pool.

    Prefers an exact case-insensitive match; falls back to a single prefix
    match. An ambiguous or missing name is a resolution failure so the
    constraint is rejected with a reason instead of guessing.
    """
    rows = await conn.fetch(
        """
        SELECT id, name_es, name_en
        FROM food
        WHERE deleted_at IS NULL
          AND (nutritionist_id IS NULL OR nutritionist_id = $2)
          AND (name_es ILIKE $1 OR name_en ILIKE $1)
        ORDER BY id
        LIMIT 5
        """,
        name.strip(),
        nutritionist_id,
    )
    if len(rows) == 1:
        return rows[0]["id"]
    if len(rows) > 1:
        raise ResolutionError(f"Food name '{name}' is ambiguous.")

    prefix = await conn.fetch(
        """
        SELECT id
        FROM food
        WHERE deleted_at IS NULL
          AND (nutritionist_id IS NULL OR nutritionist_id = $2)
          AND (name_es ILIKE $1 OR name_en ILIKE $1)
        ORDER BY id
        LIMIT 2
        """,
        f"{name.strip()}%",
        nutritionist_id,
    )
    if len(prefix) == 1:
        return prefix[0]["id"]
    raise ResolutionError(f"No food matches '{name}'.")


async def resolve(
    conn: asyncpg.Connection,
    raw: LlmConstraint,
    catalog: Catalog,
    nutritionist_id: Optional[str],
) -> ConstraintIn:
    """Turn a raw LlmConstraint into a ConstraintIn with ids and context.

    Raises ResolutionError when a code or food name cannot be mapped.
    """
    target_tag_id = catalog.tag_id(raw.target_tag_code)
    target_nutrient_id = catalog.nutrient_id(raw.target_nutrient_code)
    target_food_id = None
    if raw.target_food_name:
        target_food_id = await resolve_food_name(conn, raw.target_food_name, nutritionist_id)

    context: dict[str, Any] = {}

    if raw.type == "nutrient_ratio":
        denom = catalog.nutrient_id(raw.denominator_nutrient_code)
        if denom is not None:
            context["denominator_nutrient_id"] = denom
        if raw.ratio_bound:
            context["bound"] = raw.ratio_bound

    if raw.type == "meal_kcal_ratio" and raw.split:
        context["split"] = {k: float(v) for k, v in raw.split.items()}

    if raw.type == "max_servings_per_period" and raw.window_days is not None:
        context["window_days"] = int(raw.window_days)

    if raw.type == "no_repeat_food" and raw.granularity:
        context["granularity"] = raw.granularity

    if raw.type in ("prefer_food", "prefer_tag") and raw.meal_type:
        context["meal_type"] = raw.meal_type

    if raw.type == "forbid_combination":
        combine: dict[str, int] = {}
        if raw.combine_with_food_name:
            combine["food_id"] = await resolve_food_name(
                conn, raw.combine_with_food_name, nutritionist_id
            )
        elif raw.combine_with_tag_code:
            combine["tag_id"] = catalog.tag_id(raw.combine_with_tag_code)
        if combine:
            context["combine_with"] = combine

    return ConstraintIn(
        type=raw.type,
        priority=raw.priority,
        weight=raw.weight,
        value=raw.value,
        value2=raw.value2,
        target_food_id=target_food_id,
        target_tag_id=target_tag_id,
        target_nutrient_id=target_nutrient_id,
        context=context,
    )
