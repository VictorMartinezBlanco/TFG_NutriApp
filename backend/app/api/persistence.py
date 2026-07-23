"""Writing a generated plan and signing it.

A feasible plan is persisted as a draft (approved_at NULL) in one atomic
transaction: the plan row and all its items go together or not at all. Unlike
the PostgREST path used elsewhere, asyncpg gives a real transaction, so there is
no partial plan to compensate for. Signing is a separate, explicit step.
"""

from __future__ import annotations

import json
from datetime import date
from typing import Any, Optional

import asyncpg

from app.solver.types import FeasiblePlan


async def _meal_type_ids(conn: asyncpg.Connection) -> dict[str, int]:
    rows = await conn.fetch("SELECT id, code FROM meal_type")
    return {r["code"]: r["id"] for r in rows}


async def client_belongs_to(
    conn: asyncpg.Connection, client_id: int, nutritionist_id: str
) -> bool:
    """Whether the client exists and belongs to that nutritionist."""
    owner = await conn.fetchval(
        "SELECT nutritionist_id FROM client WHERE id = $1 AND deleted_at IS NULL",
        client_id,
    )
    return owner is not None and str(owner) == str(nutritionist_id)


async def enqueue_task(
    conn: asyncpg.Connection,
    nutritionist_id: str,
    client_id: int,
    kind: str,
    input_text: Optional[str],
    constraints: list[dict[str, Any]],
    duration_days: int,
    meals_per_day: int,
) -> int:
    """Insert a queued task and return its id. The worker picks it up later."""
    return await conn.fetchval(
        """
        INSERT INTO generation_task
            (nutritionist_id, client_id, kind, input_text, constraints,
             duration_days, meals_per_day)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
        RETURNING id
        """,
        nutritionist_id,
        client_id,
        kind,
        input_text,
        json.dumps(constraints, ensure_ascii=False),
        duration_days,
        meals_per_day,
    )


async def persist_plan(
    conn: asyncpg.Connection,
    nutritionist_id: str,
    client_id: int,
    plan: FeasiblePlan,
    duration_days: int,
    start_date: date,
) -> int:
    """Insert the plan and its items in one transaction. Returns the plan id."""
    meal_ids = await _meal_type_ids(conn)

    async with conn.transaction():
        plan_id = await conn.fetchval(
            """
            INSERT INTO plan (nutritionist_id, client_id, start_date, duration_days)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            """,
            nutritionist_id,
            client_id,
            start_date,
            duration_days,
        )

        rows = []
        for day in plan.days:
            for meal in day.meals:
                meal_type_id = meal_ids.get(meal.meal_type_code)
                if meal_type_id is None:
                    raise ValueError(f"Unknown meal type code: {meal.meal_type_code}")
                for order, item in enumerate(meal.items, start=1):
                    rows.append(
                        (plan_id, day.day_num, meal_type_id, order, item.food_id, item.grams)
                    )

        if rows:
            await conn.executemany(
                """
                INSERT INTO plan_meal_item
                    (plan_id, day_num, meal_type_id, item_order, food_id, quantity_g)
                VALUES ($1, $2, $3, $4, $5, $6)
                """,
                rows,
            )

    return plan_id


async def sign_plan(
    conn: asyncpg.Connection, plan_id: int, nutritionist_id: str
) -> tuple[str, Optional[str]]:
    """Sign a draft plan owned by the nutritionist.

    Returns (status, approved_at). status is 'signed' when it just got signed,
    'already_signed' when it was signed before. Raises LookupError if the plan
    does not exist or is not owned by the nutritionist.
    """
    row = await conn.fetchrow(
        "SELECT nutritionist_id, approved_at FROM plan WHERE id = $1 AND deleted_at IS NULL",
        plan_id,
    )
    if row is None or str(row["nutritionist_id"]) != str(nutritionist_id):
        raise LookupError("Plan not found for this nutritionist.")

    if row["approved_at"] is not None:
        return "already_signed", row["approved_at"].isoformat()

    approved = await conn.fetchval(
        """
        UPDATE plan
        SET approved_at = now(), signed_by = $2, updated_at = now()
        WHERE id = $1
        RETURNING approved_at
        """,
        plan_id,
        nutritionist_id,
    )
    return "signed", approved.isoformat()
