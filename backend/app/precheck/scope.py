"""Scope check: is the message about the client's diet at all.

Also the place where an unsupported language is caught, since telling the
language apart is part of reading the message; a separate pass would add a
full engine call for a rare case.
"""

from __future__ import annotations

from app.translator.client import LLMClient, LLMResult

from .invoke import complete_verdict
from .prompts import SCOPE_SYSTEM
from .schema import ScopeVerdict, scope_format_schema


def check_scope(text: str, *, llm: LLMClient) -> tuple[ScopeVerdict, LLMResult]:
    return complete_verdict(llm, SCOPE_SYSTEM, text, scope_format_schema(), ScopeVerdict)
