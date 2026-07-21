"""Constraint translator: free text to diet_constraint drafts.

Second producer of the diet_constraint interface, interchangeable with the
manual form. An LLM extracts intent (type, target by code or name, value,
priority); a deterministic layer resolves codes and names to ids and validates
the result against the same contract the manual producer uses. The output is a
list of ConstraintIn, indistinguishable from a manually built one for the
solver.
"""

from __future__ import annotations

from .translate import TranslationResult, translate_constraints

__all__ = ["translate_constraints", "TranslationResult"]
