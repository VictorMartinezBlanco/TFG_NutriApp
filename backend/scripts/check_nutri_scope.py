"""Checks that a nutritionist-scope constraint reaches a client's plan.

Inserts a nutritionist-scope forbid_tag red_meat (hard) for the test nutri,
loads the constraints of a client that has no rule of its own through the same
loader the service uses, and generates a plan. Asserts the loader unions the
nutri-scope row on top of the client's own, and that the solver honours it (no
red-meat food in the plan).

Uses the pure solver directly (generate_plan) to inspect the FeasiblePlan, and
load_constraints so the dual-scope query is exercised for real. Cleans up its own
row. Service role; ownership guaranteed by passing the nutri's own ids.

Run (from Repo/backend, venv active):  python -m scripts.check_nutri_scope
"""

from __future__ import annotations

import asyncio

from app.db import connection_pool
from app.solver import FeasiblePlan, generate_plan
from app.solver.loader import (
    load_client,
    load_constraints,
    load_food_pool,
    load_meal_type_codes,
)

NUTRI = "03f06edf-603e-489d-8aed-71bc93f97ef0"
CLIENT = 11  # Michael Chen: no stored constraints

_passed = 0
_failed = 0


def check(label: str, ok: bool, detail: str = "") -> None:
    global _passed, _failed
    if ok:
        _passed += 1
        print(f"    [PASS] {label}" + (f" -- {detail}" if detail else ""))
    else:
        _failed += 1
        print(f"    [FAIL] {label}" + (f" -- {detail}" if detail else ""))


def _plan_uses_tag(plan: FeasiblePlan, foods_by_id, tag_id: int) -> bool:
    for day in plan.days:
        for meal in day.meals:
            for it in meal.items:
                if tag_id in foods_by_id[it.food_id].tag_ids:
                    return True
    return False


async def _nutrient_codes(conn):
    rows = await conn.fetch("SELECT id, code FROM nutrient")
    return {r["id"]: r["code"] for r in rows}


async def main() -> None:
    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            red_meat = await conn.fetchval(
                "SELECT id FROM tag WHERE code = 'red_meat'"
            )
            assert red_meat is not None, "red_meat tag missing"

            ncodes = await _nutrient_codes(conn)
            foods = await load_food_pool(conn, NUTRI)
            foods_by_id = {f.id: f for f in foods}
            m4 = await load_meal_type_codes(conn, 4)
            client = await load_client(conn, CLIENT)
            assert client is not None, f"client {CLIENT} missing"

            red_meat_foods = [f.id for f in foods if red_meat in f.tag_ids]
            check("pool has at least one red-meat food", len(red_meat_foods) >= 1,
                  str([foods_by_id[i].name for i in red_meat_foods]))

            # clean any leftover style rule from a previous run
            await conn.execute(
                """DELETE FROM diet_constraint
                   WHERE scope_type = 'nutritionist' AND scope_nutritionist_id = $1
                     AND type = 'forbid_tag' AND target_tag_id = $2""",
                NUTRI, red_meat,
            )

            def run(cons):
                return generate_plan(
                    client, 3, 4, cons, foods,
                    nutrient_codes=ncodes, meal_codes=m4,
                )

            print("baseline: no style rule yet")
            base_cons = await load_constraints(conn, CLIENT, NUTRI)
            base_count = len(base_cons)
            check("client's own rules do not already forbid red meat",
                  not any(c.type == "forbid_tag" and c.target_tag_id == red_meat
                          for c in base_cons),
                  f"{base_count} own rows")
            base = run(base_cons)
            check("baseline is feasible", isinstance(base, FeasiblePlan))

            print("insert nutritionist-scope forbid_tag red_meat (hard)")
            cid = await conn.fetchval(
                """INSERT INTO diet_constraint
                       (scope_type, scope_nutritionist_id, type, operator,
                        target_tag_id, priority, weight, source)
                   VALUES ('nutritionist', $1, 'forbid_tag', 'forbid', $2,
                           'hard', 5, 'manual')
                   RETURNING id""",
                NUTRI, red_meat,
            )
            try:
                cons = await load_constraints(conn, CLIENT, NUTRI)
                check("loader unions the nutri-scope rule on top of the client's",
                      len(cons) == base_count + 1,
                      f"{base_count} -> {len(cons)} rows")
                check("the added rule is the nutri-scope forbid_tag red_meat",
                      any(c.type == "forbid_tag" and c.target_tag_id == red_meat
                          for c in cons))
                result = run(cons)
                check("plan with the style rule is feasible",
                      isinstance(result, FeasiblePlan))
                if isinstance(result, FeasiblePlan):
                    uses = _plan_uses_tag(result, foods_by_id, red_meat)
                    check("plan respects the nutri-scope forbid_tag (no red meat)",
                          not uses)
            finally:
                await conn.execute(
                    "DELETE FROM diet_constraint WHERE id = $1", cid
                )

    print(f"\n== {_passed} PASS, {_failed} FAIL ==")
    if _failed:
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
