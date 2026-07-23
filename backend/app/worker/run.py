"""The generation worker loop.

Polls generation_task for the oldest queued row, claims it atomically, runs the
work its kind asks for, and records the result. A task that fails goes to
'failed' with a legible reason; the loop keeps going so one bad task never takes
the worker down.

Runs on the machine where Ollama lives (localhost), which is why translation and
generation happen here and not on the host. Start it with:

    python -m app.worker.run            # real Ollama
    python -m app.worker.run --fake     # canned answers, no Ollama needed
"""

from __future__ import annotations

import argparse
import asyncio
import json
import signal
from typing import Any, Optional

import asyncpg

from app.api import service
from app.api.schemas import ConstraintIn, InfeasibleResponse
from app.db import connection_pool
from app.translator.client import FakeLLMClient, LLMClient, OllamaClient
from app.translator.translate import translate_constraints

POLL_INTERVAL_S = 2.0


async def claim_task(conn: asyncpg.Connection) -> Optional[asyncpg.Record]:
    """Take the oldest queued task and mark it in progress, atomically.

    FOR UPDATE SKIP LOCKED lets several workers run without ever grabbing the
    same row; with a single worker it is simply a safe claim.
    """
    return await conn.fetchrow(
        """
        UPDATE generation_task
        SET status = 'in_progress', started_at = now()
        WHERE id = (
            SELECT id FROM generation_task
            WHERE status = 'queued'
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        )
        RETURNING *
        """
    )


def _rejected_out(rejected: list[tuple[dict[str, Any], str]]) -> list[dict[str, Any]]:
    return [{"raw": raw, "reason": reason} for raw, reason in rejected]


async def _run_translate(
    conn: asyncpg.Connection, task: asyncpg.Record, llm: LLMClient
) -> dict[str, Any]:
    """Turn free text into proposed constraints for the modal. No plan."""
    text = task["input_text"] or ""
    tr = await translate_constraints(
        conn,
        text,
        llm=llm,
        nutritionist_id=str(task["nutritionist_id"]),
        created_by=str(task["nutritionist_id"]),
    )
    return {
        "constraints": [c.model_dump(exclude_none=True) for c in tr.constraints],
        "rejected": _rejected_out(tr.rejected),
        "model": tr.model,
        "latency_ms": tr.latency_ms,
    }


async def _run_generate(
    conn: asyncpg.Connection, task: asyncpg.Record, llm: LLMClient
) -> tuple[Optional[int], Optional[str], dict[str, Any]]:
    """Full pipeline: translate free text if any, then solve/validate/persist.

    Returns (plan_id, error, trace). error is set when the plan is infeasible.
    """
    trace: dict[str, Any] = {}

    # constraints that travelled with the task (the temporary ones from the modal).
    # asyncpg hands jsonb back as a string, so parse before validating.
    raw = task["constraints"]
    if isinstance(raw, str):
        raw = json.loads(raw)
    extra = [ConstraintIn.model_validate(c) for c in (raw or [])]

    # plus anything the free text translates to, if there was text.
    if task["input_text"]:
        tr = await translate_constraints(
            conn,
            task["input_text"],
            llm=llm,
            nutritionist_id=str(task["nutritionist_id"]),
            created_by=str(task["nutritionist_id"]),
        )
        extra.extend(tr.constraints)
        trace["rejected"] = _rejected_out(tr.rejected)

    result = await service.run_generation(
        conn,
        nutritionist_id=str(task["nutritionist_id"]),
        client_id=task["client_id"],
        duration_days=task["duration_days"],
        meals_per_day=task["meals_per_day"],
        extra=extra,
        persist=True,
    )

    if isinstance(result, InfeasibleResponse):
        return None, result.suggestion, trace

    trace["findings"] = [f.model_dump() for f in result.findings]
    return result.plan_id, None, trace


async def process_task(
    conn: asyncpg.Connection, task: asyncpg.Record, llm: LLMClient
) -> None:
    """Run one task and write its outcome. Any failure lands as 'failed'."""
    try:
        if task["kind"] == "translate":
            result = await _run_translate(conn, task, llm)
            await conn.execute(
                """
                UPDATE generation_task
                SET status = 'done', result = $2::jsonb, finished_at = now()
                WHERE id = $1
                """,
                task["id"],
                json.dumps(result, ensure_ascii=False),
            )
            return

        plan_id, error, trace = await _run_generate(conn, task, llm)
        if error is not None:
            await conn.execute(
                """
                UPDATE generation_task
                SET status = 'failed', error = $2, result = $3::jsonb,
                    finished_at = now()
                WHERE id = $1
                """,
                task["id"],
                error,
                json.dumps(trace, ensure_ascii=False),
            )
            return
        await conn.execute(
            """
            UPDATE generation_task
            SET status = 'done', plan_id = $2, result = $3::jsonb, finished_at = now()
            WHERE id = $1
            """,
            task["id"],
            plan_id,
            json.dumps(trace, ensure_ascii=False),
        )
    except Exception as exc:  # noqa: BLE001 - one bad task must not kill the loop
        await conn.execute(
            """
            UPDATE generation_task
            SET status = 'failed', error = $2, finished_at = now()
            WHERE id = $1
            """,
            task["id"],
            f"{type(exc).__name__}: {exc}",
        )


async def worker_loop(llm: LLMClient, *, stop: asyncio.Event) -> None:
    async with connection_pool() as pool:
        print("worker up, polling generation_task")
        while not stop.is_set():
            async with pool.acquire() as conn:
                task = await claim_task(conn)
                if task is None:
                    await _wait(stop, POLL_INTERVAL_S)
                    continue
                print(f"task {task['id']} ({task['kind']}) claimed")
                await process_task(conn, task, llm)
                print(f"task {task['id']} finished")
        print("worker stopped")


async def _wait(stop: asyncio.Event, seconds: float) -> None:
    try:
        await asyncio.wait_for(stop.wait(), timeout=seconds)
    except asyncio.TimeoutError:
        pass


def _build_llm(fake: bool) -> LLMClient:
    if fake:
        # Verifies the loop without Ollama; canned by a substring of the text.
        return FakeLLMClient(
            canned={
                "protein": {
                    "constraints": [
                        {"type": "nutrient_min", "priority": "hard", "value": 120,
                         "target_nutrient_code": "protein_g"}
                    ]
                }
            }
        )
    return OllamaClient()


async def _main() -> None:
    parser = argparse.ArgumentParser(description="NutriApp generation worker")
    parser.add_argument("--fake", action="store_true", help="use canned answers, no Ollama")
    args = parser.parse_args()

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    with __import__("contextlib").suppress(NotImplementedError):
        # Windows may not support signal handlers on the loop; Ctrl+C still works.
        loop.add_signal_handler(signal.SIGINT, stop.set)
        loop.add_signal_handler(signal.SIGTERM, stop.set)

    await worker_loop(_build_llm(args.fake), stop=stop)


if __name__ == "__main__":
    try:
        asyncio.run(_main())
    except KeyboardInterrupt:
        pass
