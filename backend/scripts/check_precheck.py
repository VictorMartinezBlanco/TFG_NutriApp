"""Test bank of the pre-translation checks and the plain infeasibility text.

Two modes, like the translator bank:
- fake (always): a fake engine replays canned verdicts, so the short circuit,
  the result contract, the stored-conflict detection, the traces and the plain
  explanation run deterministically with no Ollama.
- ollama (when reachable): the real check model classifies a few messages.
  Each case is retried to absorb non-determinism; it passes if any attempt
  lands the expected status.

Uso (desde Repo/backend, con el venv activo):
    python -m scripts.check_precheck            # fake + ollama si responde
    python -m scripts.check_precheck --fake     # solo fake
"""

from __future__ import annotations

import asyncio
import json
import sys
from typing import Any

import httpx

from app.api.explain import explain_infeasible, load_name_index, ref_ids
from app.api.schemas import ConstraintIn
from app.config import settings
from app.db import connection_pool
from app.precheck import (
    CheckEngines,
    find_draft_conflicts,
    find_stored_conflicts,
    run_prechecks,
)
from app.solver.loader import load_constraints
from app.solver.types import ConstraintRef
from app.translator.client import FakeLLMClient
from app.worker.run import Engines, claim_task, process_task

NUTRI = "03f06edf-603e-489d-8aed-71bc93f97ef0"
CLIENT = 11  # Michael Chen: no stored constraints, clean base

_passed = 0
_failed = 0


def check(label: str, ok: bool) -> None:
    global _passed, _failed
    if ok:
        _passed += 1
        print(f"  PASS  {label}")
    else:
        _failed += 1
        print(f"  FAIL  {label}")


class RecordingFake:
    """Fake engine that counts its calls, to prove the short circuit."""

    def __init__(self, canned: dict[str, dict[str, Any]]) -> None:
        self.inner = FakeLLMClient(canned=canned)
        self.calls = 0

    def complete(self, system: str, user: str, schema: dict[str, Any]):
        self.calls += 1
        return self.inner.complete(system, user, schema)


async def run_fake(conn) -> None:
    print("\n=== FAKE (deterministic) ===")

    # out of scope: the scope check stops everything after one call.
    llm = RecordingFake({"pelicula": {"verdict": "out_of_scope", "reason": "not about diet"}})
    pre = await run_prechecks(
        conn, "Recomiendame una pelicula para esta noche", llms=CheckEngines.single(llm),
        created_by=NUTRI, write_trace=True,
    )
    check("out of scope detected", pre.status == "out_of_scope")
    check("out of scope carries a message", bool(pre.message))
    check("short circuit: one call only", llm.calls == 1)

    # unsupported language: the deterministic gate blocks it before any call.
    llm = RecordingFake({})
    pre = await run_prechecks(
        conn, "Bitte 2000 Kalorien pro Tag und kein Schweinefleisch.",
        llms=CheckEngines.single(llm), created_by=NUTRI, write_trace=False,
    )
    check("unsupported language detected", pre.status == "unsupported_language")
    check("language gate spends no engine call", llm.calls == 0)

    # missing info: scope passes on defaults, completeness stops it.
    llm = RecordingFake({"proteina": {"complete": False, "missing": ["protein amount"]}})
    pre = await run_prechecks(
        conn, "Dale mas proteina", llms=CheckEngines.single(llm),
        created_by=NUTRI, write_trace=False,
    )
    check("missing info detected", pre.status == "missing_info")
    check("missing info names what is missing", pre.details == ["protein amount"])
    check("short circuit after completeness", llm.calls == 2)

    # contradiction inside the message: third and last check.
    llm = RecordingFake({"vegana": {"contradictory": True, "conflict": "vegan diet plus daily chicken"}})
    pre = await run_prechecks(
        conn, "Dieta vegana estricta y pollo todos los dias", llms=CheckEngines.single(llm),
        created_by=NUTRI, write_trace=False,
    )
    check("contradiction detected", pre.status == "contradiction")
    check("conflict described", pre.details == ["vegan diet plus daily chicken"])
    check("all three checks ran", llm.calls == 3)

    # clean message: the three checks pass on defaults, nothing is blocked.
    llm = RecordingFake({})
    pre = await run_prechecks(
        conn, "Unas 1500 kcal al dia y es vegetariana", llms=CheckEngines.single(llm),
        created_by=NUTRI, write_trace=False,
    )
    check("clean message passes", pre.status == "ok")
    check("clean message runs all checks", llm.calls == 3)

    # traces: the out-of-scope run above wrote one marked row.
    rows = await conn.fetch(
        "SELECT output_constraints FROM llm_translation WHERE created_by = $1", NUTRI
    )
    marked = 0
    for r in rows:
        payload = r["output_constraints"]
        if isinstance(payload, str):
            payload = json.loads(payload)
        if payload and isinstance(payload[0], dict) and "check" in payload[0]:
            marked += 1
    check("trace rows carry the check marker", marked >= 1)


async def run_stored_conflicts(conn) -> None:
    print("\n=== STORED CONFLICTS (deterministic) ===")
    cid = await conn.fetchval(
        """
        INSERT INTO diet_constraint
            (scope_type, scope_client_id, type, priority, weight, value, source)
        VALUES ('client', $1, 'kcal_target', 'soft', 7, 1500, 'manual')
        RETURNING id
        """,
        CLIENT,
    )
    try:
        stored = await load_constraints(conn, CLIENT, NUTRI)
        names = await load_name_index(conn)
        drafts = [ConstraintIn(type="kcal_target", priority="soft", value=2000)]
        conflicts = find_stored_conflicts(drafts, stored, names)
        check("second kcal target flagged", len(conflicts) == 1)
        check(
            "conflict names both values",
            bool(conflicts) and "2000" in conflicts[0] and "1500" in conflicts[0],
        )

        same = find_stored_conflicts(
            [ConstraintIn(type="kcal_target", priority="soft", value=1500)], stored, names
        )
        check("same value is not a conflict", same == [])

        pair = find_draft_conflicts(
            [
                ConstraintIn(type="kcal_target", priority="soft", value=1500),
                ConstraintIn(type="kcal_target", priority="soft", value=2200),
            ],
            names,
        )
        check("two kcal targets in one message flagged", len(pair) == 1)
    finally:
        await conn.execute("DELETE FROM diet_constraint WHERE id = $1", cid)


async def run_explain(conn) -> None:
    print("\n=== PLAIN INFEASIBILITY ===")
    protein_id = await conn.fetchval("SELECT id FROM nutrient WHERE code = 'protein_g'")
    core = [
        ConstraintRef(id=1, type="kcal_target", priority="hard", value=900),
        ConstraintRef(
            id=2, type="nutrient_min", priority="hard", value=180,
            target_nutrient_id=protein_id,
        ),
    ]
    food_ids, tag_ids, nut_ids = ref_ids(core)
    names = await load_name_index(
        conn, food_ids=food_ids, tag_ids=tag_ids, nutrient_ids=nut_ids
    )
    text = explain_infeasible(core, names)
    check("mentions the kcal value", "900 kcal" in text)
    check("names the real nutrient", "protein" in text.lower())
    check("no raw ids leak", str(protein_id) not in text)

    lactose_id = await conn.fetchval("SELECT id FROM tag WHERE code = 'lactose'")
    one = [ConstraintRef(id=3, type="forbid_tag", priority="hard", target_tag_id=lactose_id)]
    names = await load_name_index(conn, tag_ids={lactose_id})
    text = explain_infeasible(one, names)
    check("single-item core reads as a sentence", text.startswith("No plan can satisfy"))

    check("empty core falls back to generic text", "culprit" in explain_infeasible([], names))


async def run_worker_integration(conn) -> None:
    print("\n=== WORKER INTEGRATION (fake) ===")
    await conn.execute(
        "DELETE FROM generation_task WHERE nutritionist_id = $1", NUTRI
    )

    # a translate task whose text fails the scope check ends done with the verdict.
    tid = await conn.fetchval(
        """
        INSERT INTO generation_task
            (nutritionist_id, client_id, kind, input_text, constraints,
             duration_days, meals_per_day)
        VALUES ($1, $2, 'translate', $3, '[]'::jsonb, 3, 4)
        RETURNING id
        """,
        NUTRI, CLIENT, "Recomiendame una pelicula",
    )
    llm = FakeLLMClient(canned={"pelicula": {"verdict": "out_of_scope", "reason": "not about diet"}})
    task = await claim_task(conn)
    await process_task(conn, task, Engines.single(llm))
    row = await conn.fetchrow("SELECT * FROM generation_task WHERE id = $1", tid)
    result = row["result"]
    if isinstance(result, str):
        result = json.loads(result)
    check("blocked task ends done, not failed", row["status"] == "done")
    check(
        "verdict travels in result.precheck",
        bool(result) and result.get("precheck", {}).get("status") == "out_of_scope",
    )
    check("no constraints proposed", "constraints" not in (result or {}))

    # a clean translate task keeps the old contract plus an ok precheck.
    tid = await conn.fetchval(
        """
        INSERT INTO generation_task
            (nutritionist_id, client_id, kind, input_text, constraints,
             duration_days, meals_per_day)
        VALUES ($1, $2, 'translate', $3, '[]'::jsonb, 3, 4)
        RETURNING id
        """,
        NUTRI, CLIENT, "at least 120 g of protein",
    )
    llm = FakeLLMClient(
        canned={
            "protein": {
                "constraints": [
                    {"type": "nutrient_min", "priority": "hard", "value": 120,
                     "target_nutrient_code": "protein_g"}
                ]
            }
        }
    )
    task = await claim_task(conn)
    await process_task(conn, task, Engines.single(llm))
    row = await conn.fetchrow("SELECT * FROM generation_task WHERE id = $1", tid)
    result = row["result"]
    if isinstance(result, str):
        result = json.loads(result)
    check("clean task ends done", row["status"] == "done")
    check(
        "clean task still proposes constraints",
        bool(result) and len(result.get("constraints", [])) == 1,
    )
    check(
        "clean task reports precheck ok",
        bool(result) and result.get("precheck", {}).get("status") == "ok",
    )

    # infeasible generate: the error is the plain explanation with real names.
    tid = await conn.fetchval(
        """
        INSERT INTO generation_task
            (nutritionist_id, client_id, kind, input_text, constraints,
             duration_days, meals_per_day)
        VALUES ($1, $2, 'generate', $3, '[]'::jsonb, 3, 4)
        RETURNING id
        """,
        NUTRI, CLIENT, "an impossible diet",
    )
    llm = FakeLLMClient(
        canned={
            "impossible": {
                "constraints": [
                    {"type": "kcal_target", "priority": "hard", "value": 300},
                    {"type": "nutrient_min", "priority": "hard", "value": 400,
                     "target_nutrient_code": "protein_g"},
                ]
            }
        }
    )
    task = await claim_task(conn)
    await process_task(conn, task, Engines.single(llm))
    row = await conn.fetchrow("SELECT * FROM generation_task WHERE id = $1", tid)
    result = row["result"]
    if isinstance(result, str):
        result = json.loads(result)
    check("infeasible generate lands failed", row["status"] == "failed")
    check(
        "error is worded with real names",
        bool(row["error"]) and "protein" in row["error"].lower(),
    )
    check(
        "result carries the named core",
        bool(result)
        and any(c.get("target") == "Protein" for c in result.get("infeasible", {}).get("core", [])),
    )

    await conn.execute("DELETE FROM generation_task WHERE nutritionist_id = $1", NUTRI)


def _ollama_up() -> bool:
    try:
        r = httpx.get(f"{settings.ollama_host.rstrip('/')}/api/tags", timeout=3)
        return r.status_code == 200
    except httpx.HTTPError:
        return False


OLLAMA_CASES = [
    ("out of scope", "Recomiendame una pelicula para ver esta noche con mi pareja.", "out_of_scope"),
    ("clean message", "Quiere perder peso, unas 1500 kcal al dia y es vegetariana.", "ok"),
    ("missing info", "Dale mas proteina.", "missing_info"),
    ("contradiction", "Dieta vegana estricta, y ponle pollo a la plancha todos los dias.", "contradiction"),
    ("unsupported language", "Il doit manger environ 1800 kcal par jour, sans lactose.", "unsupported_language"),
]


async def run_ollama(conn, attempts: int = 3) -> None:
    print(
        f"\n=== OLLAMA (scope {settings.ollama_scope_model}, "
        f"completeness {settings.ollama_completeness_model}, "
        f"contradiction {settings.ollama_contradiction_model}) ==="
    )
    llms = CheckEngines.from_settings()
    for name, text, expected in OLLAMA_CASES:
        ok = False
        for _ in range(attempts):
            try:
                pre = await run_prechecks(
                    conn, text, llms=llms, created_by=NUTRI, write_trace=False,
                )
            except Exception as exc:
                print(f"    (attempt error: {exc})")
                continue
            if pre.status == expected:
                ok = True
                break
        check(f"{name}: real models land '{expected}' in <= {attempts} tries", ok)


async def main() -> None:
    fake_only = "--fake" in sys.argv
    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            await run_fake(conn)
            await run_stored_conflicts(conn)
            await run_explain(conn)
            await run_worker_integration(conn)
            if fake_only:
                print("\n(ollama skipped: --fake)")
            elif _ollama_up():
                await run_ollama(conn)
            else:
                print("\n(ollama skipped: not reachable at "
                      f"{settings.ollama_host}; run `ollama serve`)")
            # traces written by the fake runs
            await conn.execute(
                "DELETE FROM llm_translation WHERE created_by = $1", NUTRI
            )

    print(f"\n==== {_passed} passed, {_failed} failed ====")
    sys.exit(1 if _failed else 0)


if __name__ == "__main__":
    asyncio.run(main())
