"""Structured output of each check call.

The schema handed to the model marks every field required so a small local
model always fills them. The parsing side keeps defaults that read as a clean
verdict: a reply that does not address the question parses as 'no problem
found' instead of crashing the pipeline, and the canned fallback of the fake
client passes every check, which keeps the no-Ollama paths working.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ScopeVerdict(BaseModel):
    model_config = ConfigDict(extra="ignore")

    verdict: Literal["in_scope", "out_of_scope"] = "in_scope"
    reason: str = ""


class CompletenessVerdict(BaseModel):
    model_config = ConfigDict(extra="ignore")

    # field order is generation order under constrained output: the model
    # writes the analysis, then the missing pieces, and only then the verdict,
    # which keeps it from answering by pattern.
    analysis: str = ""
    missing: list[str] = Field(default_factory=list)
    complete: bool = True


class ContradictionVerdict(BaseModel):
    model_config = ConfigDict(extra="ignore")

    analysis: str = ""
    contradictory: bool = False
    conflict: str = ""


def _required_schema(model: type[BaseModel]) -> dict[str, Any]:
    schema = model.model_json_schema()
    schema["required"] = list(schema.get("properties", {}).keys())
    schema.pop("description", None)
    return schema


def scope_format_schema() -> dict[str, Any]:
    return _required_schema(ScopeVerdict)


def completeness_format_schema() -> dict[str, Any]:
    return _required_schema(CompletenessVerdict)


def contradiction_format_schema() -> dict[str, Any]:
    return _required_schema(ContradictionVerdict)
