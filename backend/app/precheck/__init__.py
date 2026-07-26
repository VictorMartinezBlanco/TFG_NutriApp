"""Pre-translation checks over the nutritionist's free text.

Three isolated engine calls (scope, completeness, contradiction) that run
before the translator and stop a problematic message with a concrete, legible
verdict instead of letting it produce a confusing translation. A deterministic
fourth step compares the translated drafts against the client's stored
constraints. All calls go through the same LLMClient interface the translator
uses, with a smaller model.
"""

from .completeness import check_completeness
from .contradiction import check_contradiction, find_draft_conflicts, find_stored_conflicts
from .language import unsupported_language
from .run import CheckEngines, run_prechecks
from .scope import check_scope
from .types import PrecheckResult

__all__ = [
    "CheckEngines",
    "PrecheckResult",
    "check_completeness",
    "check_contradiction",
    "check_scope",
    "find_draft_conflicts",
    "find_stored_conflicts",
    "run_prechecks",
    "unsupported_language",
]
