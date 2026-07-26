"""Orchestrator of the pre-translation checks.

Runs the three checks in order with a short circuit: a message that fails one
never reaches the next, and never reaches the translator. Each check is its own
engine call with its own minimal context. Every call leaves a trace row for the
evaluation metrics, marked with the check it belongs to so translator rows stay
distinguishable.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Optional

import asyncpg
from pydantic import BaseModel

from app.config import settings
from app.translator.client import LLMClient, LLMResult, OllamaClient

from .completeness import check_completeness
from .contradiction import check_contradiction
from .language import unsupported_language
from .scope import check_scope
from .types import PrecheckResult


@dataclass
class CheckEngines:
    """One engine per check: the cheapest model that does each job reliably,
    picked from measurements, each overridable by configuration."""

    scope: LLMClient
    completeness: LLMClient
    contradiction: LLMClient

    @classmethod
    def single(cls, llm: LLMClient) -> "CheckEngines":
        return cls(scope=llm, completeness=llm, contradiction=llm)

    @classmethod
    def from_settings(cls) -> "CheckEngines":
        return cls(
            scope=OllamaClient(model=settings.ollama_scope_model),
            completeness=OllamaClient(model=settings.ollama_completeness_model),
            contradiction=OllamaClient(model=settings.ollama_contradiction_model),
        )


async def run_prechecks(
    conn: asyncpg.Connection,
    text: str,
    *,
    llms: CheckEngines,
    created_by: Optional[str] = None,
    write_trace: bool = True,
) -> PrecheckResult:
    # language is decided by code, not by a model, before any engine call.
    if unsupported_language(text):
        return PrecheckResult(
            status="unsupported_language",
            message="Please write the request in Spanish or English.",
        )

    scope, res = check_scope(text, llm=llms.scope)
    if write_trace:
        await _write_trace(conn, text, "scope", scope, res, created_by)
    if scope.verdict == "out_of_scope":
        return PrecheckResult(
            status="out_of_scope",
            message="This request does not seem to be about the client's diet, "
            "so no constraints were applied.",
            details=[scope.reason] if scope.reason else [],
        )

    comp, res = check_completeness(text, llm=llms.completeness)
    if write_trace:
        await _write_trace(conn, text, "completeness", comp, res, created_by)
    if not comp.complete:
        missing = ", ".join(comp.missing) if comp.missing else "some details"
        return PrecheckResult(
            status="missing_info",
            message=f"The request is missing information: {missing}.",
            details=comp.missing,
        )

    contra, res = check_contradiction(text, llm=llms.contradiction)
    if write_trace:
        await _write_trace(conn, text, "contradiction", contra, res, created_by)
    if contra.contradictory:
        return PrecheckResult(
            status="contradiction",
            message="The request contradicts itself, so no constraints were "
            "applied.",
            details=[contra.conflict] if contra.conflict else [],
        )

    return PrecheckResult(status="ok")


async def _write_trace(
    conn: asyncpg.Connection,
    text: str,
    check: str,
    verdict: BaseModel,
    result: LLMResult,
    created_by: Optional[str],
) -> None:
    """One llm_translation row per check call, marked so the translator's own
    rows stay apart. Cost is 0 with a local engine."""
    payload = [{"check": check, "verdict": verdict.model_dump()}]
    await conn.execute(
        """
        INSERT INTO llm_translation
            (input_text, output_constraints, model, tokens_input, tokens_output,
             cost_eur, latency_ms, created_by)
        VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8)
        """,
        text,
        json.dumps(payload, ensure_ascii=False),
        result.model,
        result.tokens_input,
        result.tokens_output,
        0,
        result.latency_ms,
        created_by,
    )
