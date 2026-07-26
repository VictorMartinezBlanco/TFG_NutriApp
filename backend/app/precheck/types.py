"""Outcome contract of the pre-translation checks.

A PrecheckResult is what the caller (the worker) stores in the task result for
the frontend to display. Status 'ok' means the message may proceed to the
translator; any other status carries a legible message for the nutritionist and
the details that back it (what is missing, which requests conflict).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

PrecheckStatus = Literal[
    "ok", "out_of_scope", "unsupported_language", "missing_info", "contradiction"
]


@dataclass
class PrecheckResult:
    status: PrecheckStatus
    message: str = ""
    details: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.status == "ok"

    def to_payload(self) -> dict[str, Any]:
        """Shape stored under the 'precheck' key of generation_task.result."""
        return {
            "status": self.status,
            "message": self.message,
            "details": self.details,
        }
