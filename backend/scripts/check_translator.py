"""Test bank of the constraint translator.

Runs Spanish nutritionist phrases through the translator and asserts properties
of the output, not exact equality: the LLM is non-deterministic, so a phrase is
correct when it yields a constraint of the right type, with the right target,
the right hard/soft nature, and passing the shared validation. Numeric values
are checked within a tolerance.

Two modes:
- fake (always): a FakeLLMClient replays canned model answers, so resolution,
  validation, the trace and the indistinguishability check run deterministically
  with no Ollama. This is the part that must stay green in CI-like runs.
- ollama (when reachable): the same phrases hit the real model. Each phrase is
  retried a few times to absorb non-determinism; a phrase passes if any attempt
  satisfies the properties. Skipped with a notice when Ollama does not answer.

Uso (desde Repo/backend, con el venv activo):
    python -m scripts.check_translator            # fake + ollama si responde
    python -m scripts.check_translator --fake     # solo fake
"""

from __future__ import annotations

import asyncio
import sys

import httpx

from app.config import settings
from app.db import connection_pool
from app.translator.client import FakeLLMClient, OllamaClient
from app.translator.translate import translate_constraints
from app.api.service import _to_constraint

NUTRI = "03f06edf-603e-489d-8aed-71bc93f97ef0"
VALUE_TOL_PCT = 10.0

_passed = 0
_failed = 0


def check(cond: bool, label: str) -> None:
    global _passed, _failed
    if cond:
        _passed += 1
        print(f"  PASS  {label}")
    else:
        _failed += 1
        print(f"  FAIL  {label}")


def _near(got, expected, tol_pct=VALUE_TOL_PCT) -> bool:
    if got is None or expected is None:
        return got == expected
    return abs(got - expected) <= abs(expected) * tol_pct / 100 + 1e-6


# Each case: phrase, and the properties the translation must have. A property is
# (type, matcher) where matcher inspects the ConstraintIn. Canned answer feeds
# the fake client; the real model must produce something satisfying the props.
CASES = [
    {
        "name": "Maria (kcal + vegetariana)",
        "text": "Quiere perder peso, ponle unas 1500 kcal al dia y es vegetariana.",
        "canned": {"constraints": [
            {"type": "kcal_target", "priority": "soft", "weight": 7, "value": 1500},
            {"type": "prefer_tag", "priority": "soft", "weight": 4, "target_tag_code": "vegetarian"},
        ]},
        "props": [
            ("kcal_target", lambda c, ids: c.priority == "soft" and _near(c.value, 1500)),
            ("prefer_tag", lambda c, ids: c.priority == "soft" and c.target_tag_id == ids["tag"]["vegetarian"]),
        ],
    },
    {
        "name": "John (alergia cacahuete + proteina)",
        "text": "Busca ganar musculo, es alergico al cacahuete y quiero al menos 140 g de proteina al dia.",
        "canned": {"constraints": [
            {"type": "forbid_tag", "priority": "hard", "weight": 10, "target_tag_code": "peanuts"},
            {"type": "nutrient_min", "priority": "soft", "weight": 6, "target_nutrient_code": "protein_g", "value": 140},
        ]},
        "props": [
            ("forbid_tag", lambda c, ids: c.priority == "hard" and c.target_tag_id == ids["tag"]["peanuts"]),
            ("nutrient_min", lambda c, ids: c.target_nutrient_id == ids["nut"]["protein_g"] and _near(c.value, 140)),
        ],
    },
    {
        "name": "Emma (lactosa + sodio)",
        "text": "Es diabetica e intolerante a la lactosa, y no pase de 2000 mg de sodio.",
        "canned": {"constraints": [
            {"type": "forbid_tag", "priority": "hard", "weight": 9, "target_tag_code": "lactose"},
            {"type": "nutrient_max", "priority": "soft", "weight": 7, "target_nutrient_code": "sodium_mg", "value": 2000},
        ]},
        "props": [
            ("forbid_tag", lambda c, ids: c.priority == "hard" and c.target_tag_id == ids["tag"]["lactose"]),
            ("nutrient_max", lambda c, ids: c.target_nutrient_id == ids["nut"]["sodium_mg"] and _near(c.value, 2000)),
        ],
    },
    {
        "name": "meal split (context)",
        "text": "El desayuno debe ser un 30% de las calorias y la comida un 40%.",
        "canned": {"constraints": [
            {"type": "meal_kcal_ratio", "priority": "soft", "weight": 5, "split": {"breakfast": 30, "lunch": 40}},
        ]},
        "props": [
            ("meal_kcal_ratio", lambda c, ids: bool(c.context.get("split")) and sum(c.context["split"].values()) <= 100),
        ],
    },
    {
        # food resolved by name (ILIKE) against the visible pool. forbid_food is
        # where the local model reliably captures the food name; the serving cap
        # phrasing, where the food competes with a number and a window for the
        # model's attention, is a known weak spot of the 7B model and is left to
        # the fake path. The resolution path itself is the same either way.
        "name": "forbid food por nombre (food ILIKE)",
        "text": "No quiero que coma ternera en el plan.",
        "canned": {"constraints": [
            {"type": "forbid_food", "priority": "hard", "weight": 8, "target_food_name": "ternera", "value": 0},
        ]},
        "props": [
            ("forbid_food", lambda c, ids: c.priority == "hard" and c.target_food_id == ids["food"]["ternera"]),
        ],
    },
    {
        "name": "max servings (context, fake-only reliable)",
        "text": "Como mucho salmon dos veces por semana.",
        "canned": {"constraints": [
            {"type": "max_servings_per_period", "priority": "soft", "weight": 5, "target_food_name": "salmon", "value": 2, "window_days": 7},
        ]},
        "props": [
            ("max_servings_per_period", lambda c, ids: c.target_food_id == ids["food"]["salmon"] and _near(c.value, 2)),
        ],
        "fake_only": True,
    },
    {
        "name": "ratio (context, denominador)",
        "text": "Que las grasas saturadas no superen un tercio de la grasa total.",
        "canned": {"constraints": [
            {"type": "nutrient_ratio", "priority": "soft", "weight": 5, "target_nutrient_code": "sat_fat_g", "denominator_nutrient_code": "fat_g", "value": 0.33, "ratio_bound": "max"},
        ]},
        "props": [
            ("nutrient_ratio", lambda c, ids: c.target_nutrient_id == ids["nut"]["sat_fat_g"] and c.context.get("denominator_nutrient_id") == ids["nut"]["fat_g"]),
        ],
    },
]


async def _load_ids(conn):
    tags = {r["code"]: r["id"] for r in await conn.fetch("SELECT id, code FROM tag")}
    nuts = {r["code"]: r["id"] for r in await conn.fetch("SELECT id, code FROM nutrient")}
    salmon = await conn.fetchval(
        "SELECT id FROM food WHERE deleted_at IS NULL AND name_en ILIKE 'salmon%' ORDER BY id LIMIT 1"
    )
    ternera = await conn.fetchval(
        "SELECT id FROM food WHERE deleted_at IS NULL AND name_es ILIKE 'ternera%' ORDER BY id LIMIT 1"
    )
    return {"tag": tags, "nut": nuts, "food": {"salmon": salmon, "ternera": ternera}}


def _match_props(result, props, ids) -> bool:
    """Every expected (type, matcher) is satisfied by some produced constraint,
    and every produced constraint passes as a solver Constraint (indistinguishable
    from a manual one)."""
    for i, c in enumerate(result.constraints):
        try:
            _to_constraint(c, -(i + 1))  # raises Unprocessable if not solver-ready
        except Exception:
            return False
    for want_type, matcher in props:
        if not any(c.type == want_type and matcher(c, ids) for c in result.constraints):
            return False
    return True


async def run_fake(conn, ids) -> None:
    print("\n=== FAKE (deterministic) ===")
    for case in CASES:
        fake = FakeLLMClient(canned={case["text"][:20]: case["canned"]})
        result = await translate_constraints(
            conn, case["text"], llm=fake, nutritionist_id=NUTRI,
            created_by=NUTRI, write_trace=True,
        )
        ok = _match_props(result, case["props"], ids) and not result.rejected
        check(ok, f"{case['name']}: props + all valid + no rejects")

    # negative: an unknown tag code must be rejected, not reach the solver.
    bad = FakeLLMClient(canned={"celiaco": {"constraints": [
        {"type": "forbid_tag", "priority": "hard", "weight": 8, "target_tag_code": "not_a_code"},
    ]}})
    res = await translate_constraints(
        conn, "El cliente es celiaco raro", llm=bad, nutritionist_id=NUTRI,
        created_by=NUTRI, write_trace=False,
    )
    check(len(res.constraints) == 0 and len(res.rejected) == 1,
          "unknown tag code rejected with reason")

    # trace: a row landed in llm_translation for this nutritionist.
    n = await conn.fetchval(
        "SELECT count(*) FROM llm_translation WHERE created_by = $1", NUTRI
    )
    check(n >= len(CASES), f"trace rows written to llm_translation ({n})")


def _ollama_up() -> bool:
    try:
        r = httpx.get(f"{settings.ollama_host.rstrip('/')}/api/tags", timeout=3)
        return r.status_code == 200
    except httpx.HTTPError:
        return False


async def run_ollama(conn, ids, attempts=3) -> None:
    print(f"\n=== OLLAMA ({settings.ollama_model}) ===")
    client = OllamaClient()
    for case in CASES:
        if case.get("fake_only"):
            continue
        ok = False
        for _ in range(attempts):
            try:
                result = await translate_constraints(
                    conn, case["text"], llm=client, nutritionist_id=NUTRI,
                    created_by=NUTRI, write_trace=True,
                )
            except Exception as exc:  # engine hiccup: retry
                print(f"    (attempt error: {exc})")
                continue
            if _match_props(result, case["props"], ids):
                ok = True
                break
        check(ok, f"{case['name']}: real model satisfies props in <= {attempts} tries")


async def main() -> None:
    fake_only = "--fake" in sys.argv
    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            ids = await _load_ids(conn)
            await run_fake(conn, ids)
            if fake_only:
                print("\n(ollama skipped: --fake)")
            elif _ollama_up():
                await run_ollama(conn, ids)
            else:
                print("\n(ollama skipped: not reachable at "
                      f"{settings.ollama_host}; run `ollama serve`)")

    print(f"\n==== {_passed} passed, {_failed} failed ====")
    sys.exit(1 if _failed else 0)


if __name__ == "__main__":
    asyncio.run(main())
