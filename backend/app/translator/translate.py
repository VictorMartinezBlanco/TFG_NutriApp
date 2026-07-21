"""Orchestrator: free text to validated constraint drafts, with a trace.

Builds the prompt, calls the engine, parses its structured output (bounded
retry when the shape is wrong), resolves codes and names to ids, validates each
draft against the shared contract, and writes one row to llm_translation for the
evaluation metrics. Constraints that fail resolution or validation are dropped
with a reason; the lot is never lost because one entry was malformed.

The result is a list of ConstraintIn indistinguishable from manually entered
ones. Whether any of them get stored as real rows (permanent) or only feed a
single generation (temporary) is decided downstream, not here.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Optional

import asyncpg
from pydantic import ValidationError

from app.api.schemas import ConstraintIn

from .client import LLMClient, LLMError
from .prompt import build_system_prompt, build_user_prompt
from .resolve import Catalog, ResolutionError, load_catalog, resolve
from .schema import LlmTranslation, ollama_format_schema
from .validation import validate_draft

_MAX_ATTEMPTS = 2


@dataclass
class TranslationResult:
    constraints: list[ConstraintIn]
    rejected: list[tuple[dict[str, Any], str]] = field(default_factory=list)
    model: str = ""
    latency_ms: int = 0
    tokens_input: Optional[int] = None
    tokens_output: Optional[int] = None


def _parse(data: dict[str, Any]) -> LlmTranslation:
    return LlmTranslation.model_validate(data)


async def translate_constraints(
    conn: asyncpg.Connection,
    text: str,
    *,
    llm: LLMClient,
    nutritionist_id: Optional[str] = None,
    created_by: Optional[str] = None,
    client_context: Optional[dict[str, Any]] = None,
    write_trace: bool = True,
) -> TranslationResult:
    """Translate free text into validated ConstraintIn drafts."""
    system = build_system_prompt()
    user = build_user_prompt(text, client_context)
    schema = ollama_format_schema()

    parsed: Optional[LlmTranslation] = None
    last_error = ""
    result = None
    for _ in range(_MAX_ATTEMPTS):
        try:
            result = llm.complete(system, user, schema)
            parsed = _parse(result.data)
            break
        except (ValidationError, LLMError) as exc:
            last_error = str(exc)
            parsed = None
    if parsed is None:
        raise LLMError(f"Could not obtain valid structured output: {last_error}")

    catalog = await load_catalog(conn)
    accepted: list[ConstraintIn] = []
    rejected: list[tuple[dict[str, Any], str]] = []

    for raw in parsed.constraints:
        raw_dump = raw.model_dump(exclude_none=True)
        try:
            draft = await resolve(conn, raw, catalog, nutritionist_id)
        except ResolutionError as exc:
            rejected.append((raw_dump, str(exc)))
            continue
        reason = validate_draft(draft)
        if reason is not None:
            rejected.append((raw_dump, reason))
            continue
        accepted.append(draft)

    out = TranslationResult(
        constraints=accepted,
        rejected=rejected,
        model=result.model,
        latency_ms=result.latency_ms,
        tokens_input=result.tokens_input,
        tokens_output=result.tokens_output,
    )

    if write_trace:
        await _write_trace(conn, text, out, created_by)

    return out


async def _write_trace(
    conn: asyncpg.Connection,
    text: str,
    result: TranslationResult,
    created_by: Optional[str],
) -> None:
    """One row in llm_translation. cost is 0 with a local engine; the column
    exists for the future comparison with a hosted one."""
    output = [c.model_dump(exclude_none=True) for c in result.constraints]
    await conn.execute(
        """
        INSERT INTO llm_translation
            (input_text, output_constraints, model, tokens_input, tokens_output,
             cost_eur, latency_ms, created_by)
        VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8)
        """,
        text,
        json.dumps(output, ensure_ascii=False),
        result.model,
        result.tokens_input,
        result.tokens_output,
        0,
        result.latency_ms,
        created_by,
    )
