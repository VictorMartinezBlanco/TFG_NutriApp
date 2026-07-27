"""Prompt format study: how message wording affects translation accuracy.

Runs every (format, message, repetition) cell of the study through the real
translator and scores the output against a ground truth by properties with
tolerance, the same idea check_translator applies to single phrases. Messages,
formats and expected constraints live in feedback-docs/estudio-formatos/
mensajes.json; raw per-cell results are appended to a JSON file that the
plotting script consumes.

Scoring, as pre-registered in the study document:
  - an expected constraint counts as hit when some produced valid constraint
    has its type, its target and, when the ground truth declares one, a value
    within 10 percent (nutrient_ratio also accepts the 0-100 scale).
  - matching is one to one; produced valid constraints left unmatched count as
    spurious. Rejected drafts are counted apart.
  - a cell succeeds when every expected constraint is hit and none is spurious.

No trace rows are written: the study lives in files, the database stays clean.
Cells already present in the output file are skipped, so an interrupted run
resumes where it left off (--fresh starts over).

Run (from Repo/backend, venv active):
    python -m scripts.eval_formats                # real Ollama, 3 reps
    python -m scripts.eval_formats --fake         # canned perfect answers
    python -m scripts.eval_formats --prechecks    # formats vs 7e prechecks
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any, Optional

import asyncpg

from app.db import connection_pool
from app.precheck import CheckEngines
from app.precheck.run import run_prechecks
from app.translator.client import FakeLLMClient, LLMError, OllamaClient
from app.translator.translate import translate_constraints

NUTRI = "03f06edf-603e-489d-8aed-71bc93f97ef0"
VALUE_TOL_PCT = 10.0
DEFAULT_REPS = 3

STUDY_DIR = Path(__file__).resolve().parents[2] / "feedback-docs" / "estudio-formatos"
MESSAGES_FILE = STUDY_DIR / "mensajes.json"
RESULTS_FILE = STUDY_DIR / "resultados_crudos.json"
PRECHECKS_FILE = STUDY_DIR / "resultados_prechecks.json"


def _near(got: Optional[float], expected: float, tol_pct: float = VALUE_TOL_PCT) -> bool:
    if got is None:
        return False
    return abs(got - expected) <= abs(expected) * tol_pct / 100 + 1e-6


def _matches(exp: dict[str, Any], c: Any, ids: dict[str, dict[str, int]]) -> bool:
    """Does produced constraint c satisfy expected constraint exp?"""
    if c.type != exp["type"]:
        return False
    if "tag_code" in exp and c.target_tag_id != ids["tag"].get(exp["tag_code"]):
        return False
    if "nutrient_code" in exp and c.target_nutrient_id != ids["nut"].get(exp["nutrient_code"]):
        return False
    if "food_prefix" in exp and c.target_food_id != ids["food"].get(exp["food_prefix"]):
        return False
    ctx = c.context or {}
    if "denominator_code" in exp:
        if ctx.get("denominator_nutrient_id") != ids["nut"].get(exp["denominator_code"]):
            return False
    if "split" in exp:
        split = ctx.get("split") or {}
        for meal, pct in exp["split"].items():
            if meal not in split or not _near(split[meal], pct):
                return False
    if "value" in exp:
        if exp["type"] == "nutrient_ratio":
            # the model may answer on the 0-1 or the 0-100 scale; both are the
            # same statement, so both are accepted (pre-registered).
            if not (_near(c.value, exp["value"]) or _near(c.value, exp["value"] * 100)):
                return False
        elif not _near(c.value, exp["value"]):
            return False
    return True


def _score(expected: list[dict], produced: list[Any], ids: dict) -> tuple[int, list[str], int]:
    """One-to-one greedy match. Returns (hits, missed labels, spurious count)."""
    used = [False] * len(produced)
    hits = 0
    missed: list[str] = []
    for exp in expected:
        found = False
        for i, c in enumerate(produced):
            if not used[i] and _matches(exp, c, ids):
                used[i] = True
                hits += 1
                found = True
                break
        if not found:
            missed.append(exp["type"])
    spurious = used.count(False)
    return hits, missed, spurious


async def _load_ids(conn: asyncpg.Connection, messages: list[dict]) -> dict:
    tags = {r["code"]: r["id"] for r in await conn.fetch("SELECT id, code FROM tag")}
    nuts = {r["code"]: r["id"] for r in await conn.fetch("SELECT id, code FROM nutrient")}
    foods: dict[str, int] = {}
    for m in messages:
        for exp in m["expected"]:
            prefix = exp.get("food_prefix")
            if prefix and prefix not in foods:
                foods[prefix] = await conn.fetchval(
                    "SELECT id FROM food WHERE deleted_at IS NULL "
                    "AND name_es ILIKE $1 || '%' ORDER BY id LIMIT 1",
                    prefix,
                )
    return {"tag": tags, "nut": nuts, "food": foods}


def _load_results(path: Path) -> list[dict]:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return []


def _save_results(path: Path, rows: list[dict]) -> None:
    path.write_text(
        json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8"
    )


async def run_study(reps: int, fake: bool, out: Path, fresh: bool) -> None:
    spec = json.loads(MESSAGES_FILE.read_text(encoding="utf-8"))
    formats: list[str] = spec["formats"]
    messages: list[dict] = spec["messages"]

    rows = [] if fresh else _load_results(out)
    done = {(r["format"], r["message"], r["rep"]) for r in rows}

    client = OllamaClient() if not fake else None

    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            ids = await _load_ids(conn, messages)
            total = len(formats) * len(messages) * reps
            n = len(done)
            for fmt in formats:
                for m in messages:
                    for rep in range(1, reps + 1):
                        key = (fmt, m["id"], rep)
                        if key in done:
                            continue
                        llm = client or FakeLLMClient(canned={"": m["canned"]})
                        row: dict[str, Any] = {
                            "format": fmt, "message": m["id"], "rep": rep,
                            "n_expected": len(m["expected"]),
                        }
                        try:
                            result = await translate_constraints(
                                conn, m["texts"][fmt], llm=llm,
                                nutritionist_id=NUTRI, created_by=NUTRI,
                                write_trace=False,
                            )
                        except LLMError as exc:
                            row.update({
                                "n_matched": 0, "missed": [e["type"] for e in m["expected"]],
                                "n_spurious": 0, "n_rejected": 0, "success": False,
                                "latency_ms": None, "tokens_input": None,
                                "tokens_output": None, "model": None,
                                "error": str(exc),
                            })
                        else:
                            hits, missed, spurious = _score(
                                m["expected"], result.constraints, ids
                            )
                            row.update({
                                "n_matched": hits, "missed": missed,
                                "n_spurious": spurious,
                                "n_rejected": len(result.rejected),
                                "success": hits == len(m["expected"]) and spurious == 0,
                                "latency_ms": result.latency_ms,
                                "tokens_input": result.tokens_input,
                                "tokens_output": result.tokens_output,
                                "model": result.model, "error": None,
                            })
                        rows.append(row)
                        _save_results(out, rows)
                        n += 1
                        mark = "ok " if row["success"] else "MISS"
                        print(f"[{n}/{total}] {fmt} m{m['id']} rep{rep} {mark} "
                              f"({row['n_matched']}/{row['n_expected']} hit, "
                              f"{row['n_spurious']} spurious, {row['n_rejected']} rejected)")

    ok = sum(1 for r in rows if r["success"])
    print(f"\ncells: {len(rows)}, success: {ok} ({100 * ok / len(rows):.1f}%)")
    print(f"raw results in {out}")


async def run_precheck_pass(fake: bool, out: Path, fresh: bool) -> None:
    """Secondary measure: would the 7e prechecks block a non-human format?"""
    spec = json.loads(MESSAGES_FILE.read_text(encoding="utf-8"))
    rows = [] if fresh else _load_results(out)
    done = {(r["format"], r["message"]) for r in rows}

    engines = (
        CheckEngines.single(FakeLLMClient()) if fake else CheckEngines.from_settings()
    )
    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            total = len(spec["formats"]) * len(spec["messages"])
            n = len(done)
            for fmt in spec["formats"]:
                for m in spec["messages"]:
                    if (fmt, m["id"]) in done:
                        continue
                    pre = await run_prechecks(
                        conn, m["texts"][fmt], llms=engines,
                        created_by=NUTRI, write_trace=False,
                    )
                    rows.append({
                        "format": fmt, "message": m["id"],
                        "status": pre.status, "message_text": pre.message,
                    })
                    _save_results(out, rows)
                    n += 1
                    print(f"[{n}/{total}] {fmt} m{m['id']} -> {pre.status}")

    blocked = sum(1 for r in rows if r["status"] != "ok")
    print(f"\ncells: {len(rows)}, blocked: {blocked}")
    print(f"precheck results in {out}")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Prompt format study harness")
    parser.add_argument("--fake", action="store_true", help="canned answers, no Ollama")
    parser.add_argument("--prechecks", action="store_true",
                        help="run the precheck pass instead of the translator study")
    parser.add_argument("--reps", type=int, default=DEFAULT_REPS)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--fresh", action="store_true", help="ignore previous results")
    args = parser.parse_args()

    if args.prechecks:
        await run_precheck_pass(args.fake, args.out or PRECHECKS_FILE, args.fresh)
    else:
        await run_study(args.reps, args.fake, args.out or RESULTS_FILE, args.fresh)


if __name__ == "__main__":
    asyncio.run(main())
