"""One check call: complete, parse, bounded retry.

Shared by the three checks so each stays a single question to the engine. The
engine interface is the same LLMClient the translator uses, so the checks work
with Ollama, with the fake client, or with a hosted engine.
"""

from __future__ import annotations

from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from app.translator.client import LLMClient, LLMError, LLMResult

from .prompts import build_user_prompt

_MAX_ATTEMPTS = 2

V = TypeVar("V", bound=BaseModel)


def complete_verdict(
    llm: LLMClient,
    system: str,
    text: str,
    schema: dict[str, Any],
    model_cls: type[V],
) -> tuple[V, LLMResult]:
    last_error = ""
    for _ in range(_MAX_ATTEMPTS):
        try:
            result = llm.complete(system, build_user_prompt(text), schema)
            return model_cls.model_validate(result.data), result
        except (ValidationError, LLMError) as exc:
            last_error = str(exc)
    raise LLMError(f"Check did not return valid structured output: {last_error}")
