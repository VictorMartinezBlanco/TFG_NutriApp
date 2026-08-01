"""Deterministic validation rules.

Four families: physiological safety, consistency with the client hard
constraints (an independent recheck of the solver), structural sanity, and
food-level plausibility (serving profiles, roles and meal slots, 8e).
Each rule is a small function returning a list of findings, empty when it holds.
Consistency checks mirror the solver handlers in app.solver.catalog.
"""

from __future__ import annotations

from typing import Callable, Optional

from app.solver import config as SC
from app.solver.model import daily_kcal_floor, serving_bounds
from app.solver.types import ClientProfile, Constraint, FeasiblePlan, Food

from . import config as VC
from .recompute import DailyNutrients, pool_has_code
from .types import Finding, Location, Severity


def _hard(code: str, message: str, loc: Location) -> Finding:
    return Finding(Severity.HARD_FAIL, code, message, loc)


def _within_tol(value: float, target: float) -> bool:
    """value is within QUANT_TOL_PCT of target, both ways."""
    margin = abs(target) * VC.QUANT_TOL_PCT / 100
    return target - margin <= value <= target + margin


# --- family A: physiological safety -----------------------------------------


def check_kcal_floor(daily: list[DailyNutrients], floor: int) -> list[Finding]:
    out = []
    for d in daily:
        kcal = d.totals.get(SC.KCAL_CODE, 0.0)
        if kcal < floor * (1 - VC.QUANT_TOL_PCT / 100):
            out.append(_hard(
                "kcal_floor",
                f"Day {d.day_num} has {kcal:.0f} kcal, below the {floor} kcal safety floor.",
                Location(day_num=d.day_num),
            ))
    return out


def check_protein_range(daily: list[DailyNutrients], client: ClientProfile) -> list[Finding]:
    weight = client.weight_kg if client.weight_kg is not None else SC.DEFAULT_WEIGHT_KG
    lo = SC.PROTEIN_G_PER_KG[0] * weight
    hi = SC.PROTEIN_G_PER_KG[1] * weight
    out = []
    for d in daily:
        prot = d.totals.get(SC.PROTEIN_CODE, 0.0)
        if prot < lo * (1 - VC.QUANT_TOL_PCT / 100) or prot > hi * (1 + VC.QUANT_TOL_PCT / 100):
            out.append(_hard(
                "protein_range",
                f"Day {d.day_num} protein {prot:.0f}g is outside the human range "
                f"{lo:.0f}-{hi:.0f}g for {weight:.0f}kg.",
                Location(day_num=d.day_num),
            ))
    return out


def check_fat_min_energy(daily: list[DailyNutrients]) -> list[Finding]:
    out = []
    for d in daily:
        kcal = d.totals.get(SC.KCAL_CODE, 0.0)
        if kcal <= 0:
            continue
        fat_kcal = d.totals.get(SC.FAT_CODE, 0.0) * SC.KCAL_PER_G[SC.FAT_CODE]
        if fat_kcal < SC.FAT_MIN_PCT_ENERGY / 100 * kcal * (1 - VC.QUANT_TOL_PCT / 100):
            out.append(_hard(
                "fat_min_energy",
                f"Day {d.day_num} fat provides {fat_kcal / kcal * 100:.0f}% of energy, "
                f"below the {SC.FAT_MIN_PCT_ENERGY}% minimum.",
                Location(day_num=d.day_num),
            ))
    return out


def check_micro_toxicity(daily: list[DailyNutrients]) -> list[Finding]:
    # warning, not hard fail: the solver does not cap micronutrients, so this
    # flags a plan the solver built validly rather than rejecting it.
    out = []
    for d in daily:
        for code, limit in VC.MICRO_TOXICITY_LIMITS.items():
            amount = d.totals.get(code, 0.0)
            if amount > limit:
                out.append(Finding(
                    Severity.WARNING,
                    "micro_toxicity",
                    f"Day {d.day_num} {code} {amount:.0f} exceeds the safe daily limit {limit:.0f}.",
                    Location(day_num=d.day_num),
                ))
    return out


# --- family B: consistency with hard constraints ----------------------------
#
# each checker recomputes the plan against one hard constraint, independent of
# the solver. it mirrors the matching handler in app.solver.catalog.


def _foods_in_meal(meal, food_index: dict[int, Food], predicate) -> bool:
    return any(
        it.food_id in food_index and predicate(food_index[it.food_id]) for it in meal.items
    )


def _present_by_day(plan: FeasiblePlan, member_ids: set[int]) -> dict[int, bool]:
    out = {}
    for d in plan.days:
        out[d.day_num] = any(
            it.food_id in member_ids for m in d.meals for it in m.items
        )
    return out


def _nutrient_code(nutrient_codes: dict[int, str], nid: Optional[int]) -> Optional[str]:
    return nutrient_codes.get(nid) if nid is not None else None


def check_forbid_food(c: Constraint, plan, daily, food_index, ncodes, tags) -> list[Finding]:
    fid = c.target_food_id
    if fid is None:
        return []
    out = []
    for d in plan.days:
        for m in d.meals:
            for it in m.items:
                if it.food_id == fid:
                    out.append(_hard(
                        "forbid_food",
                        f"Forbidden food {fid} appears on day {d.day_num}.",
                        Location(day_num=d.day_num, meal_type_code=m.meal_type_code, food_id=fid),
                    ))
    return out


def check_forbid_tag(c: Constraint, plan, daily, food_index, ncodes, tags) -> list[Finding]:
    tid = c.target_tag_id
    if tid is None:
        return []
    out = []
    for d in plan.days:
        for m in d.meals:
            for it in m.items:
                food = food_index.get(it.food_id)
                if food and tid in food.tag_ids:
                    out.append(_hard(
                        "forbid_tag",
                        f"Food {it.food_id} with forbidden tag {tid} appears on day {d.day_num}.",
                        Location(day_num=d.day_num, meal_type_code=m.meal_type_code, food_id=it.food_id),
                    ))
    return out


def _combination_second(c: Constraint, tags: dict[int, list[int]]) -> set[int]:
    combine = c.context.get("combine_with") or {}
    if "food_id" in combine:
        return {combine["food_id"]}
    if "tag_id" in combine:
        return set(tags.get(combine["tag_id"], []))
    return set()


def _combination_first(c: Constraint, tags: dict[int, list[int]]) -> set[int]:
    if c.target_food_id is not None:
        return {c.target_food_id}
    if c.target_tag_id is not None:
        return set(tags.get(c.target_tag_id, []))
    return set()


def check_forbid_combination(c: Constraint, plan, daily, food_index, ncodes, tags) -> list[Finding]:
    first = _combination_first(c, tags)
    second = _combination_second(c, tags)
    if not first or not second:
        return []
    out = []
    for d in plan.days:
        for m in d.meals:
            ids = {it.food_id for it in m.items}
            if ids & first and ids & second:
                out.append(_hard(
                    "forbid_combination",
                    f"Forbidden combination present together on day {d.day_num} at {m.meal_type_code}.",
                    Location(day_num=d.day_num, meal_type_code=m.meal_type_code),
                ))
    return out


def check_kcal_target(c: Constraint, plan, daily, food_index, ncodes, tags) -> list[Finding]:
    if c.value is None:
        return []
    out = []
    for d in daily:
        kcal = d.totals.get(SC.KCAL_CODE, 0.0)
        if not _within_tol(kcal, c.value):
            out.append(_hard(
                "kcal_target",
                f"Day {d.day_num} kcal {kcal:.0f} does not meet the hard target {c.value:.0f}.",
                Location(day_num=d.day_num),
            ))
    return out


def check_macro_target(c: Constraint, plan, daily, food_index, ncodes, tags) -> list[Finding]:
    code = _nutrient_code(ncodes, c.target_nutrient_id)
    if code is None or c.value is None or not pool_has_code(food_index, code):
        return []
    out = []
    for d in daily:
        amount = d.totals.get(code, 0.0)
        if not _within_tol(amount, c.value):
            out.append(_hard(
                "macro_target",
                f"Day {d.day_num} {code} {amount:.0f} does not meet the hard target {c.value:.0f}.",
                Location(day_num=d.day_num),
            ))
    return out


def check_nutrient_min(c: Constraint, plan, daily, food_index, ncodes, tags) -> list[Finding]:
    code = _nutrient_code(ncodes, c.target_nutrient_id)
    if code is None or c.value is None or not pool_has_code(food_index, code):
        return []
    out = []
    for d in daily:
        amount = d.totals.get(code, 0.0)
        if amount < c.value * (1 - VC.QUANT_TOL_PCT / 100):
            out.append(_hard(
                "nutrient_min",
                f"Day {d.day_num} {code} {amount:.0f} is below the hard minimum {c.value:.0f}.",
                Location(day_num=d.day_num),
            ))
    return out


def check_nutrient_max(c: Constraint, plan, daily, food_index, ncodes, tags) -> list[Finding]:
    code = _nutrient_code(ncodes, c.target_nutrient_id)
    if code is None or c.value is None or not pool_has_code(food_index, code):
        return []
    out = []
    for d in daily:
        amount = d.totals.get(code, 0.0)
        if amount > c.value * (1 + VC.QUANT_TOL_PCT / 100):
            out.append(_hard(
                "nutrient_max",
                f"Day {d.day_num} {code} {amount:.0f} is above the hard maximum {c.value:.0f}.",
                Location(day_num=d.day_num),
            ))
    return out


def check_nutrient_ratio(c: Constraint, plan, daily, food_index, ncodes, tags) -> list[Finding]:
    num_code = _nutrient_code(ncodes, c.target_nutrient_id)
    den_code = _nutrient_code(ncodes, c.context.get("denominator_nutrient_id"))
    if num_code is None or den_code is None or c.value is None:
        return []
    if not pool_has_code(food_index, num_code) or not pool_has_code(food_index, den_code):
        return []
    bound = c.context.get("bound", "max")
    out = []
    for d in daily:
        num = d.totals.get(num_code, 0.0)
        den = d.totals.get(den_code, 0.0)
        # cross multiplication as in the solver, avoids dividing by zero.
        if bound == "min":
            ok = num >= c.value * den * (1 - VC.QUANT_TOL_PCT / 100)
        else:
            ok = num <= c.value * den * (1 + VC.QUANT_TOL_PCT / 100)
        if not ok:
            out.append(_hard(
                "nutrient_ratio",
                f"Day {d.day_num} {num_code}/{den_code} breaks the hard {bound} ratio {c.value}.",
                Location(day_num=d.day_num),
            ))
    return out


def _windows(days: list[int], size: int):
    last = days[-1]
    for start in days:
        w = [d for d in range(start, start + size) if d <= last]
        if w:
            yield w


def check_max_servings(c: Constraint, plan, daily, food_index, ncodes, tags) -> list[Finding]:
    if c.value is None:
        return []
    members = _combination_first(c, tags)
    if not members:
        return []
    window = int(c.context.get("window_days", len(plan.days)))
    cap = int(c.value)
    days = [d.day_num for d in plan.days]
    day_by_num = {d.day_num: d for d in plan.days}
    out = []
    for wdays in _windows(days, window):
        count = sum(
            1
            for dn in wdays
            for m in day_by_num[dn].meals
            for it in m.items
            if it.food_id in members
        )
        if count > cap:
            out.append(_hard(
                "max_servings_per_period",
                f"{count} servings in the window starting day {wdays[0]} exceed the cap {cap}.",
                Location(day_num=wdays[0]),
            ))
    return out


def _no_repeat(c: Constraint, plan, members: set[int], code: str) -> list[Finding]:
    if c.value is None or not members:
        return []
    sep = int(c.value)
    present = _present_by_day(plan, members)
    days = [d.day_num for d in plan.days]
    out = []
    for wdays in _windows(days, sep):
        if len(wdays) > 1 and sum(1 for dn in wdays if present.get(dn)) > 1:
            out.append(_hard(
                code,
                f"Repeated within {sep} days in the window starting day {wdays[0]}.",
                Location(day_num=wdays[0]),
            ))
    return out


def check_no_repeat_food(c: Constraint, plan, daily, food_index, ncodes, tags) -> list[Finding]:
    if c.target_food_id is None:
        return []
    return _no_repeat(c, plan, {c.target_food_id}, "no_repeat_food")


def check_no_repeat_tag(c: Constraint, plan, daily, food_index, ncodes, tags) -> list[Finding]:
    if c.target_tag_id is None:
        return []
    return _no_repeat(c, plan, set(tags.get(c.target_tag_id, [])), "no_repeat_tag")


_HARD_CHECKS: dict[str, Callable] = {
    "forbid_food": check_forbid_food,
    "forbid_tag": check_forbid_tag,
    "forbid_combination": check_forbid_combination,
    "kcal_target": check_kcal_target,
    "macro_target": check_macro_target,
    "nutrient_min": check_nutrient_min,
    "nutrient_max": check_nutrient_max,
    "nutrient_ratio": check_nutrient_ratio,
    "max_servings_per_period": check_max_servings,
    "no_repeat_food": check_no_repeat_food,
    "no_repeat_tag": check_no_repeat_tag,
}


def check_hard_constraints(
    plan: FeasiblePlan,
    constraints: list[Constraint],
    daily: list[DailyNutrients],
    *,
    food_index: dict[int, Food],
    nutrient_codes: dict[int, str],
    tag_members: dict[int, list[int]],
) -> list[Finding]:
    out: list[Finding] = []
    for c in constraints:
        if c.priority != "hard":
            continue
        checker = _HARD_CHECKS.get(c.type)
        if checker is None:
            continue
        out.extend(checker(c, plan, daily, food_index, nutrient_codes, tag_members))
    return out


# --- family C: structural sanity --------------------------------------------


def check_meal_structure(plan: FeasiblePlan) -> list[Finding]:
    out = []
    for d in plan.days:
        for m in d.meals:
            n = len(m.items)
            if n < 1 or n > SC.MAX_ITEMS_PER_MEAL:
                out.append(_hard(
                    "meal_structure",
                    f"Day {d.day_num} {m.meal_type_code} has {n} items, outside 1-{SC.MAX_ITEMS_PER_MEAL}.",
                    Location(day_num=d.day_num, meal_type_code=m.meal_type_code),
                ))
    return out


def check_min_grams(plan: FeasiblePlan) -> list[Finding]:
    out = []
    for d in plan.days:
        for m in d.meals:
            for it in m.items:
                if it.grams < SC.MIN_GRAMS_PRESENT:
                    out.append(_hard(
                        "min_grams",
                        f"Day {d.day_num} {m.meal_type_code} item {it.food_id} has "
                        f"{it.grams}g, below the {SC.MIN_GRAMS_PRESENT}g minimum.",
                        Location(day_num=d.day_num, meal_type_code=m.meal_type_code, food_id=it.food_id),
                    ))
    return out


# --- family D: food-level plausibility (8e) ----------------------------------
# every check here mirrors a hard guarantee of the solver's plausibility layer,
# so a violation is a hard_fail: if it shows up, one of the two engines is wrong.


def check_serving_profile(
    plan: FeasiblePlan, food_index: dict[int, Food]
) -> list[Finding]:
    """Item grams must sit inside the food's serving profile (fallbacks for
    foods without one), and unit-based foods must land on unit multiples
    (halves, or whole pieces for the whole-only foods)."""
    out = []
    for d in plan.days:
        for m in d.meals:
            for it in m.items:
                food = food_index.get(it.food_id)
                if food is None:
                    continue
                loc = Location(day_num=d.day_num, meal_type_code=m.meal_type_code,
                               food_id=it.food_id)
                lo, hi = serving_bounds(food)
                if not (lo <= it.grams <= hi):
                    out.append(_hard(
                        "serving_profile",
                        f"Day {d.day_num} {m.meal_type_code}: {food.name} at "
                        f"{it.grams}g, outside its {lo}-{hi}g serving profile.",
                        loc,
                    ))
                if food.grams_per_unit:
                    gpu = float(food.grams_per_unit)
                    steps = 1 if food.name in SC.WHOLE_UNIT_FOOD_NAMES else 2
                    k = round(steps * it.grams / gpu)
                    if abs(steps * it.grams - k * gpu) > 1e-6:
                        out.append(_hard(
                            "serving_units",
                            f"Day {d.day_num} {m.meal_type_code}: {food.name} at "
                            f"{it.grams}g is not a multiple of "
                            f"{'whole' if steps == 1 else 'half'} units of {gpu:g}g.",
                            loc,
                        ))
    return out


def check_slot_whitelist(
    plan: FeasiblePlan, food_index: dict[int, Food]
) -> list[Finding]:
    """A food with moment tags can only appear in those meal slots."""
    out = []
    for d in plan.days:
        for m in d.meals:
            for it in m.items:
                food = food_index.get(it.food_id)
                if food is None:
                    continue
                allowed = {
                    t[len(SC.MOMENT_TAG_PREFIX):]
                    for t in food.tag_codes
                    if t.startswith(SC.MOMENT_TAG_PREFIX)
                }
                if allowed and m.meal_type_code not in allowed:
                    out.append(_hard(
                        "slot_whitelist",
                        f"Day {d.day_num}: {food.name} is not plausible at "
                        f"{m.meal_type_code} (allowed: {', '.join(sorted(allowed))}).",
                        Location(day_num=d.day_num, meal_type_code=m.meal_type_code,
                                 food_id=it.food_id),
                    ))
    return out


def check_main_meal_size(plan: FeasiblePlan) -> list[Finding]:
    """Main meals ask for at least MIN_ITEMS_MAIN_MEAL items."""
    out = []
    for d in plan.days:
        for m in d.meals:
            if m.meal_type_code in SC.MAIN_MEAL_CODES and len(m.items) < SC.MIN_ITEMS_MAIN_MEAL:
                out.append(_hard(
                    "main_meal_size",
                    f"Day {d.day_num} {m.meal_type_code} has {len(m.items)} item(s); "
                    f"a main meal asks for at least {SC.MIN_ITEMS_MAIN_MEAL}.",
                    Location(day_num=d.day_num, meal_type_code=m.meal_type_code),
                ))
    return out


def check_condiments(
    plan: FeasiblePlan, food_index: dict[int, Food]
) -> list[Finding]:
    """Condiments never go alone in a meal and respect the daily cap.

    Mirrors the solver guard: if the whole pool is condiments the solver skips
    the accompaniment rule, so the validator skips it too.
    """
    def is_condiment(food_id: int) -> bool:
        food = food_index.get(food_id)
        return food is not None and SC.CONDIMENT_TAG in food.tag_codes

    out = []
    pool_has_others = any(
        SC.CONDIMENT_TAG not in f.tag_codes for f in food_index.values()
    )
    for d in plan.days:
        day_count = 0
        for m in d.meals:
            conds = [it for it in m.items if is_condiment(it.food_id)]
            day_count += len(conds)
            if conds and pool_has_others and len(conds) == len(m.items):
                out.append(_hard(
                    "condiment_alone",
                    f"Day {d.day_num} {m.meal_type_code} is condiments only; "
                    "a condiment needs something to accompany.",
                    Location(day_num=d.day_num, meal_type_code=m.meal_type_code),
                ))
        if day_count > SC.CONDIMENT_MAX_PER_DAY:
            out.append(_hard(
                "condiment_daily_cap",
                f"Day {d.day_num} has {day_count} condiment servings, above the "
                f"daily cap of {SC.CONDIMENT_MAX_PER_DAY}.",
                Location(day_num=d.day_num),
            ))
    return out


def check_sweet_fruit_cap(
    plan: FeasiblePlan, food_index: dict[int, Food]
) -> list[Finding]:
    """At most one sweet or fruit item per meal, they are a complement."""
    out = []
    for d in plan.days:
        for m in d.meals:
            n = 0
            for it in m.items:
                food = food_index.get(it.food_id)
                if food is not None and (
                    SC.SWEET_TAG in food.tag_codes or SC.FRUIT_TAG in food.tag_codes
                ):
                    n += 1
            if n > SC.SWEET_FRUIT_MAX_PER_MEAL:
                out.append(_hard(
                    "sweet_fruit_cap",
                    f"Day {d.day_num} {m.meal_type_code} has {n} sweet/fruit items; "
                    f"at most {SC.SWEET_FRUIT_MAX_PER_MEAL} per meal.",
                    Location(day_num=d.day_num, meal_type_code=m.meal_type_code),
                ))
    return out
