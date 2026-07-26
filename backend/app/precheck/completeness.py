"""Completeness check: does each stated request carry the data to apply it."""

from __future__ import annotations

from app.translator.client import LLMClient, LLMResult

from .invoke import complete_verdict
from .prompts import COMPLETENESS_SYSTEM
from .schema import CompletenessVerdict, completeness_format_schema


def check_completeness(
    text: str, *, llm: LLMClient
) -> tuple[CompletenessVerdict, LLMResult]:
    return complete_verdict(
        llm, COMPLETENESS_SYSTEM, text, completeness_format_schema(), CompletenessVerdict
    )
