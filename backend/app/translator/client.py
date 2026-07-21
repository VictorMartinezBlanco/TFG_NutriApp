"""LLM engine behind a thin interface.

The translator depends on LLMClient, not on Ollama. Swapping the engine (a
hosted API, a different local model) is a matter of another implementation, no
change to the translation logic. OllamaClient talks to a local Ollama over
HTTP; FakeLLMClient replays canned answers so the pipeline can be verified
without a running model.

The privacy argument for Ollama lives here: it is local, so client data never
leaves the machine, and there is no API key. A hosted engine would carry its
key in host environment variables, never in the repo.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any, Optional, Protocol

import httpx

from ..config import settings


@dataclass
class LLMResult:
    """One completion: the parsed JSON object plus trace metadata."""

    data: dict[str, Any]
    model: str
    latency_ms: int
    tokens_input: Optional[int] = None
    tokens_output: Optional[int] = None
    raw_text: str = ""


class LLMError(RuntimeError):
    """The engine failed or returned something that is not JSON."""


class LLMClient(Protocol):
    def complete(
        self, system: str, user: str, schema: dict[str, Any]
    ) -> LLMResult: ...


class OllamaClient:
    """Local Ollama engine using its structured-output `format` field.

    `format` set to a JSON schema makes Ollama constrain generation to that
    shape, which is the reliable way to get parseable output from a local
    model. temperature 0 keeps it as deterministic as the model allows.
    """

    def __init__(
        self,
        host: Optional[str] = None,
        model: Optional[str] = None,
        timeout_s: float = 120.0,
    ) -> None:
        self.host = (host or settings.ollama_host).rstrip("/")
        self.model = model or settings.ollama_model
        self.timeout_s = timeout_s

    def complete(self, system: str, user: str, schema: dict[str, Any]) -> LLMResult:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "format": schema,
            "stream": False,
            "options": {"temperature": 0},
        }
        started = time.perf_counter()
        try:
            resp = httpx.post(
                f"{self.host}/api/chat", json=payload, timeout=self.timeout_s
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise LLMError(f"Ollama request failed: {exc}") from exc
        latency_ms = int((time.perf_counter() - started) * 1000)

        body = resp.json()
        content = body.get("message", {}).get("content", "")
        try:
            data = json.loads(content)
        except json.JSONDecodeError as exc:
            raise LLMError(f"Model did not return valid JSON: {exc}") from exc

        return LLMResult(
            data=data,
            model=self.model,
            latency_ms=latency_ms,
            tokens_input=body.get("prompt_eval_count"),
            tokens_output=body.get("eval_count"),
            raw_text=content,
        )


@dataclass
class FakeLLMClient:
    """Replays canned answers, matched by a substring of the user text.

    Lets the resolver, validation and trace be verified deterministically with
    no Ollama running. Each entry maps a trigger substring to the JSON object
    the model would have produced.
    """

    canned: dict[str, dict[str, Any]] = field(default_factory=dict)
    model: str = "fake"
    latency_ms: int = 1

    def complete(self, system: str, user: str, schema: dict[str, Any]) -> LLMResult:
        for trigger, data in self.canned.items():
            if trigger.lower() in user.lower():
                return LLMResult(
                    data=data,
                    model=self.model,
                    latency_ms=self.latency_ms,
                    tokens_input=len(user.split()),
                    tokens_output=sum(len(str(v).split()) for v in data.values()),
                    raw_text=json.dumps(data, ensure_ascii=False),
                )
        return LLMResult(
            data={"constraints": []},
            model=self.model,
            latency_ms=self.latency_ms,
            raw_text='{"constraints": []}',
        )
