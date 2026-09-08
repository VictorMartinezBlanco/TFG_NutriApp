"""Generation service: from a request to a serialized result.

Loads the client, constraints and food pool, checks that the client belongs to
the caller, runs the solver and, when feasible, the validator, and persists a
draft. The endpoints translate the exceptions raised here into HTTP codes.
"""

from __future__ import annotations

from datetime import date

import asyncpg

from app.solver import InfeasiblePlan, generate_plan
from app.solver.types import Constraint
from app.solver.config import DEFAULT_WEIGHTS, ObjectiveWeights
from app.solver.loader import (
    load_client,
    load_constraints,
    load_food_pool,
    load_meal_type_codes,
)
from app.translator.validation import validate_draft
from app.validator import validate_plan

from . import persistence, serialize
from .explain import explain_infeasible, load_name_index, ref_ids
from .schemas import ConstraintIn, FeasibleResponse, GenerateRequest, InfeasibleResponse


class BadRequest(Exception):
    """A referenced entity does not exist (maps to 400)."""


class Forbidden(Exception):
    """The client is not owned by the caller (maps to 403)."""


class Unprocessable(Exception):
    """Constraints are syntactically valid but incoherent (maps to 422)."""


def _to_constraint(c: ConstraintIn, synthetic_id: int) -> Constraint:
    reason = validate_draft(c)
    if reason is not None:
        raise Unprocessable(reason)
    return Constraint(
        id=synthetic_id,
        type=c.type,
        priority=c.priority,
        weight=c.weight,
        operator=c.operator,
        value=c.value,
        value2=c.value2,
        target_food_id=c.target_food_id,
        target_tag_id=c.target_tag_id,
        target_nutrient_id=c.target_nutrient_id,
        context=c.context,
    )


def _weights(raw: dict[str, int] | None) -> ObjectiveWeights:
    if not raw:
        return DEFAULT_WEIGHTS
    base = DEFAULT_WEIGHTS
    return ObjectiveWeights(
        w_kcal=raw.get("w_kcal", base.w_kcal),
        w_protein=raw.get("w_protein", base.w_protein),
        w_carb=raw.get("w_carb", base.w_carb),
        w_fat=raw.get("w_fat", base.w_fat),
        w_prefer=raw.get("w_prefer", base.w_prefer),
        w_no_repeat=raw.get("w_no_repeat", base.w_no_repeat),
        w_variety=raw.get("w_variety", base.w_variety),
    )


async def generate(
    conn: asyncpg.Connection, req: GenerateRequest
) -> FeasibleResponse | InfeasibleResponse:
    return await run_generation(
        conn,
        nutritionist_id=req.nutritionist_id,
        client_id=req.client_id,
        duration_days=req.duration_days,
        meals_per_day=req.meals_per_day,
        extra=req.constraints,
        weights=req.weights,
        persist=req.persist,
    )


async def run_generation(
    conn: asyncpg.Connection,
    *,
    nutritionist_id: str,
    client_id: int,
    duration_days: int,
    meals_per_day: int,
    extra: list[ConstraintIn],
    weights: dict[str, int] | None = None,
    persist: bool = True,
) -> FeasibleResponse | InfeasibleResponse:
    """Core pipeline: load, solve, validate and (optionally) persist a draft.

    Shared by the synchronous endpoint and the async worker so both take exactly
    the same path. Raises the tipped exceptions above; the caller maps them.
    """
    if not await persistence.client_belongs_to(conn, client_id, nutritionist_id):
        raise Forbidden("The client does not belong to this nutritionist.")

    client = await load_client(conn, client_id)
    if client is None:
        raise BadRequest(f"Client {client_id} does not exist.")

    stored = await load_constraints(conn, client_id, nutritionist_id)
    resolved_extra = [_to_constraint(c, -(i + 1)) for i, c in enumerate(extra)]
    constraints = stored + resolved_extra

    foods = await load_food_pool(conn, nutritionist_id)
    meal_codes = await load_meal_type_codes(conn, meals_per_day)
    ncodes = await _nutrient_codes(conn)

    result = generate_plan(
        client,
        duration_days,
        meals_per_day,
        constraints,
        foods,
        nutrient_codes=ncodes,
        meal_codes=meal_codes,
        weights=_weights(weights),
    )

    if isinstance(result, InfeasiblePlan):
        food_ids, tag_ids, nut_ids = ref_ids(result.unsat_core)
        names = await load_name_index(
            conn, food_ids=food_ids, tag_ids=tag_ids, nutrient_ids=nut_ids
        )
        explanation = explain_infeasible(result.unsat_core, names)
        return serialize.infeasible_response(result, explanation)

    food_index = {f.id: f for f in foods}
    tag_members: dict[int, list[int]] = {}
    for f in foods:
        for tid in f.tag_ids:
            tag_members.setdefault(tid, []).append(f.id)

    validation = validate_plan(
        result,
        client,
        constraints,
        food_index=food_index,
        nutrient_codes=ncodes,
        tag_members=tag_members,
    )

    # a draft the validator rejects never reaches the professional: it is not
    # persisted and the caller sees the hard failures in findings.
    plan_id = None
    if persist and validation.passed:
        plan_id = await persistence.persist_plan(
            conn, nutritionist_id, client_id, result,
            duration_days, date.today(),
        )

    return serialize.feasible_response(
        result, validation, duration_days, meals_per_day, plan_id
    )


async def _nutrient_codes(conn: asyncpg.Connection) -> dict[int, str]:
    rows = await conn.fetch("SELECT id, code FROM nutrient")
    return {r["id"]: r["code"] for r in rows}
