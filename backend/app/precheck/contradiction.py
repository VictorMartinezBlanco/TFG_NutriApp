"""Contradiction check, in two halves.

The engine call catches contradictions inside the message itself, which only a
reader can see. The stored-conflict half is plain code: once the message is
translated into structured drafts, comparing them against the client's stored
constraints is a deterministic job, so no model is asked to do it. It runs
after translation because it needs structured rows on both sides.
"""

from __future__ import annotations

from app.api.explain import NameIndex, fmt_value, nutrient_amount
from app.api.schemas import ConstraintIn
from app.solver.types import Constraint
from app.translator.client import LLMClient, LLMResult

from .invoke import complete_verdict
from .prompts import CONTRADICTION_SYSTEM
from .schema import ContradictionVerdict, contradiction_format_schema


def check_contradiction(
    text: str, *, llm: LLMClient
) -> tuple[ContradictionVerdict, LLMResult]:
    return complete_verdict(
        llm, CONTRADICTION_SYSTEM, text, contradiction_format_schema(), ContradictionVerdict
    )


def find_stored_conflicts(
    drafts: list[ConstraintIn], stored: list[Constraint], names: NameIndex
) -> list[str]:
    """Legible conflicts between proposed drafts and stored constraints.

    Flags only what cannot hold at the same time: a second kcal target with a
    different value, a minimum above a stored maximum for the same nutrient,
    and forbid against prefer over the same food or family. Compatible overlaps
    (two minimums, the same target repeated) are left alone.
    """
    out: list[str] = []
    for d in drafts:
        for s in stored:
            msg = _conflict(d, s, names)
            if msg is not None:
                out.append(msg)
    return out


def find_draft_conflicts(drafts: list[ConstraintIn], names: NameIndex) -> list[str]:
    """Conflicts between two drafts of the same message.

    Catches deterministically what the engine sometimes misses in the text,
    such as two different calorie targets in one message.
    """
    out: list[str] = []
    for i, a in enumerate(drafts):
        for b in drafts[i + 1:]:
            msg = _draft_pair(a, b, names)
            if msg is not None:
                out.append(msg)
    return out


def _draft_pair(a: ConstraintIn, b: ConstraintIn, names: NameIndex) -> str | None:
    if a.type == "kcal_target" and b.type == "kcal_target":
        if a.value is not None and b.value is not None and a.value != b.value:
            return (
                f"The message asks for two different kcal targets: "
                f"{fmt_value(a.value)} and {fmt_value(b.value)}."
            )
        return None

    pair = {a.type, b.type}
    if pair == {"nutrient_min", "nutrient_max"}:
        lo, hi = (a, b) if a.type == "nutrient_min" else (b, a)
        if (
            lo.target_nutrient_id is not None
            and lo.target_nutrient_id == hi.target_nutrient_id
            and lo.value is not None
            and hi.value is not None
            and lo.value > hi.value
        ):
            return (
                f"The message sets a minimum of "
                f"{nutrient_amount(names, lo.target_nutrient_id, lo.value)} above "
                f"its own maximum of {fmt_value(hi.value)}."
            )

    if pair == {"forbid_food", "prefer_food"}:
        if a.target_food_id is not None and a.target_food_id == b.target_food_id:
            return (
                f"The message both excludes and asks for "
                f"{names.food(a.target_food_id)}."
            )
    if pair == {"forbid_tag", "prefer_tag"}:
        if a.target_tag_id is not None and a.target_tag_id == b.target_tag_id:
            return (
                f"The message both excludes and asks for "
                f"{names.tag(a.target_tag_id).lower()} foods."
            )
    return None


def _conflict(d: ConstraintIn, s: Constraint, names: NameIndex) -> str | None:
    if d.type == "kcal_target" and s.type == "kcal_target":
        if d.value is not None and s.value is not None and d.value != s.value:
            return (
                f"The proposed {fmt_value(d.value)} kcal target conflicts with "
                f"the stored {fmt_value(s.value)} kcal target."
            )
        return None

    same_nutrient = (
        d.target_nutrient_id is not None
        and d.target_nutrient_id == s.target_nutrient_id
        and d.value is not None
        and s.value is not None
    )
    if same_nutrient and d.type == "nutrient_min" and s.type == "nutrient_max":
        if d.value > s.value:
            return (
                f"The proposed minimum of "
                f"{nutrient_amount(names, d.target_nutrient_id, d.value)} is above "
                f"the stored maximum of {fmt_value(s.value)}."
            )
    if same_nutrient and d.type == "nutrient_max" and s.type == "nutrient_min":
        if d.value < s.value:
            return (
                f"The proposed maximum of "
                f"{nutrient_amount(names, d.target_nutrient_id, d.value)} is below "
                f"the stored minimum of {fmt_value(s.value)}."
            )

    same_food = d.target_food_id is not None and d.target_food_id == s.target_food_id
    if same_food and d.type == "forbid_food" and s.type == "prefer_food":
        return (
            f"The message excludes {names.food(d.target_food_id)}, but a stored "
            "constraint prefers it."
        )
    if same_food and d.type == "prefer_food" and s.type == "forbid_food":
        return (
            f"The message asks for {names.food(d.target_food_id)}, but a stored "
            "constraint excludes it."
        )

    same_tag = d.target_tag_id is not None and d.target_tag_id == s.target_tag_id
    if same_tag and d.type == "forbid_tag" and s.type == "prefer_tag":
        return (
            f"The message excludes {names.tag(d.target_tag_id).lower()} foods, "
            "but a stored constraint prefers them."
        )
    if same_tag and d.type == "prefer_tag" and s.type == "forbid_tag":
        return (
            f"The message asks for {names.tag(d.target_tag_id).lower()} foods, "
            "but a stored constraint excludes them."
        )
    return None
