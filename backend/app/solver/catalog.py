"""Mapeo del catalogo de restricciones a patrones CP-SAT.

Cada tipo se traduce a una restriccion dura (fija el espacio factible) o a un
termino de la funcion objetivo (penaliza o premia). Las duras se envuelven en un
literal de asuncion para poder reconstruir el nucleo de infactibilidad. Hay un
handler por tipo del catalogo cerrado; los dos tipos estructurales
(meals_per_day, plan_duration_days) no generan restriccion porque fijan la
dimension del problema.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

from ortools.sat.python import cp_model

from . import config as C
from .model import PlanModel, scale_target
from .types import Constraint, ConstraintRef


@dataclass
class ObjectiveTerms:
    """Acumula los sumandos del objetivo (se minimiza)."""

    penalties: list[cp_model.LinearExpr] = field(default_factory=list)
    bonuses: list[cp_model.LinearExpr] = field(default_factory=list)
    # para reportar cumplimiento soft: (constraint, expr de desviacion escalada)
    soft_devs: list[tuple[Constraint, cp_model.LinearExpr]] = field(default_factory=list)

    def add_penalty(self, weight: int, expr: cp_model.LinearExpr) -> None:
        self.penalties.append(weight * expr)

    def add_bonus(self, weight: int, expr: cp_model.LinearExpr) -> None:
        self.bonuses.append(weight * expr)


@dataclass
class Applied:
    obj: ObjectiveTerms
    # literal de asuncion -> referencia de la restriccion dura que activa.
    assumptions: dict[cp_model.IntVar, ConstraintRef] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


def _ref(c: Constraint) -> ConstraintRef:
    return ConstraintRef(
        id=c.id, type=c.type, priority=c.priority, value=c.value,
        target_food_id=c.target_food_id, target_tag_id=c.target_tag_id,
        target_nutrient_id=c.target_nutrient_id,
    )


def _nutrient_code(nutrient_codes: dict[int, str], nutrient_id: Optional[int]) -> Optional[str]:
    if nutrient_id is None:
        return None
    return nutrient_codes.get(nutrient_id)


def apply_constraints(
    pm: PlanModel,
    constraints: list[Constraint],
    *,
    tag_members: dict[int, list[int]],       # tag_id -> [food_id...]
    nutrient_codes: dict[int, str],          # nutrient_id -> code
    meal_codes: list[str],                   # code por indice de comida
    weights: C.ObjectiveWeights,
) -> Applied:
    applied = Applied(obj=ObjectiveTerms())
    model = pm.model

    def hard_enforce(c: Constraint, build: Callable[[cp_model.IntVar], None]) -> None:
        """Envuelve una restriccion dura en un literal de asuncion.

        el literal se asume positivo, para que result.py lo mapee por Index() al
        reconstruir el nucleo. no pasar nunca lit.Not() a AddAssumption.
        """
        lit = model.NewBoolVar(f"assume_{c.id}")
        build(lit)
        model.AddAssumption(lit)
        applied.assumptions[lit] = _ref(c)

    for c in constraints:
        handler = _HANDLERS.get(c.type)
        if handler is None:
            continue
        handler(c, pm, applied, hard_enforce, tag_members, nutrient_codes,
                meal_codes, weights)

    return applied


# --- helpers de expresion ---------------------------------------------------


def _target_deviation(pm, code, target, upper, band_day, band_mean, factor, tag):
    """Desviacion penalizable de un objetivo diario sobre un nutriente.

    Por dia, |suma - target| se linealiza con exceso y defecto no negativos
    (suma - target == over - under). Solo cuenta lo que sobresale de la banda
    diaria: ex >= over + under - band_day. Sobre la suma de las desviaciones con
    signo del plan va la banda de la media, que deja que unos dias compensen a
    otros; su exceso entra multiplicado por factor. Las cotas de over y under
    salen del catalogo (exceso maximo upper - target, defecto maximo target):
    ajustadas, en vez de una holgura comun, ayudan a propagar. Con las bandas a
    cero devuelve la desviacion absoluta total sin variables extra. None si el
    nutriente no esta en el modelo.
    """
    model = pm.model
    over_max = max(upper - target, 0)
    daily, signed = [], []
    for d in pm.days:
        dv = pm.daily_nut.get((d, code))
        if dv is None:
            continue
        over = model.NewIntVar(0, over_max, f"over_{tag}_{d}")
        under = model.NewIntVar(0, target, f"under_{tag}_{d}")
        model.Add(dv - target == over - under)
        if band_day > 0:
            ex = model.NewIntVar(0, max(over_max, target), f"ex_{tag}_{d}")
            model.Add(ex >= over + under - band_day)
            daily.append(ex)
        else:
            daily.append(over + under)
        signed.append(over - under)
    if not daily:
        return None
    total = sum(daily)
    if band_mean <= 0:
        return total
    n = len(signed)
    bound = n * max(over_max, target)
    over_s = model.NewIntVar(0, bound, f"over_{tag}_plan")
    under_s = model.NewIntVar(0, bound, f"under_{tag}_plan")
    model.Add(sum(signed) == over_s - under_s)
    ex_s = model.NewIntVar(0, bound, f"ex_{tag}_plan")
    model.Add(ex_s >= over_s + under_s - n * band_mean)
    return total + factor * ex_s


def _foods_with_tag(tag_members: dict[int, list[int]], tag_id: int) -> list[int]:
    return tag_members.get(tag_id, [])


# --- handlers por tipo ------------------------------------------------------


def _h_kcal_target(c, pm, applied, hard_enforce, tags, ncodes, mcodes, w):
    if c.value is None:
        return
    target = scale_target(c.value)
    upper = pm.nut_upper.get(C.KCAL_CODE, target)
    if c.priority == "soft":
        b = C.DEFAULT_BANDS
        total = _target_deviation(
            pm, C.KCAL_CODE, target, upper, scale_target(b.kcal_day),
            scale_target(b.kcal_mean), b.mean_factor, f"kcal_{c.id}",
        )
        if total is None:
            return
        applied.obj.add_penalty(w.w_kcal * c.weight, total)
        applied.obj.soft_devs.append((c, total))
    else:
        hard_enforce(c, lambda lit: [
            pm.model.Add(pm.daily_nut[(d, C.KCAL_CODE)] == target).OnlyEnforceIf(lit)
            for d in pm.days if (d, C.KCAL_CODE) in pm.daily_nut
        ])


def _h_macro_target(c, pm, applied, hard_enforce, tags, ncodes, mcodes, w):
    code = _nutrient_code(ncodes, c.target_nutrient_id)
    if code is None or c.value is None:
        return
    target = scale_target(c.value)
    upper = pm.nut_upper.get(code, target)
    wf = {C.PROTEIN_CODE: w.w_protein, C.CARB_CODE: w.w_carb, C.FAT_CODE: w.w_fat}.get(code, w.w_protein)
    if c.priority == "soft":
        # las bandas de los macros son porcentaje del objetivo, en la misma escala.
        b = C.DEFAULT_BANDS
        total = _target_deviation(
            pm, code, target, upper, round(target * b.macro_day_pct / 100),
            round(target * b.macro_mean_pct / 100), b.mean_factor, f"macro_{c.id}",
        )
        if total is None:
            return
        applied.obj.add_penalty(wf * c.weight, total)
        applied.obj.soft_devs.append((c, total))
    else:
        hard_enforce(c, lambda lit: [
            pm.model.Add(pm.daily_nut[(d, code)] == target).OnlyEnforceIf(lit)
            for d in pm.days if (d, code) in pm.daily_nut
        ])


def _h_nutrient_min(c, pm, applied, hard_enforce, tags, ncodes, mcodes, w):
    code = _nutrient_code(ncodes, c.target_nutrient_id)
    if code is None or c.value is None:
        return
    target = scale_target(c.value)
    if c.priority == "hard":
        hard_enforce(c, lambda lit: [
            pm.model.Add(pm.daily_nut[(d, code)] >= target).OnlyEnforceIf(lit)
            for d in pm.days if (d, code) in pm.daily_nut
        ])
    else:
        # penaliza el defecto respecto al minimo.
        devs = []
        for d in pm.days:
            dv = pm.daily_nut.get((d, code))
            if dv is None:
                continue
            under = pm.model.NewIntVar(0, target, f"nmin_{c.id}_{d}")
            pm.model.Add(under >= target - dv)
            devs.append(under)
        total = sum(devs)
        wf = {C.PROTEIN_CODE: w.w_protein, C.CARB_CODE: w.w_carb, C.FAT_CODE: w.w_fat}.get(code, w.w_protein)
        applied.obj.add_penalty(wf * c.weight, total)
        applied.obj.soft_devs.append((c, total))


def _h_nutrient_max(c, pm, applied, hard_enforce, tags, ncodes, mcodes, w):
    code = _nutrient_code(ncodes, c.target_nutrient_id)
    if code is None or c.value is None:
        return
    target = scale_target(c.value)
    if c.priority == "hard":
        hard_enforce(c, lambda lit: [
            pm.model.Add(pm.daily_nut[(d, code)] <= target).OnlyEnforceIf(lit)
            for d in pm.days if (d, code) in pm.daily_nut
        ])
    else:
        upper = pm.nut_upper.get(code, target)
        devs = []
        for d in pm.days:
            dv = pm.daily_nut.get((d, code))
            if dv is None:
                continue
            over = pm.model.NewIntVar(0, upper, f"nmax_{c.id}_{d}")
            pm.model.Add(over >= dv - target)
            devs.append(over)
        total = sum(devs)
        applied.obj.add_penalty(w.w_kcal * c.weight, total)
        applied.obj.soft_devs.append((c, total))


def _h_nutrient_ratio(c, pm, applied, hard_enforce, tags, ncodes, mcodes, w):
    num_code = _nutrient_code(ncodes, c.target_nutrient_id)
    den_id = c.context.get("denominator_nutrient_id")
    den_code = _nutrient_code(ncodes, den_id)
    if num_code is None or den_code is None or c.value is None:
        return
    ratio = c.value
    # ratio numerador/denominador <= value -> numerador <= value * denominador.
    bound = c.context.get("bound", "max")
    num, den = int(round(ratio * 1000)), 1000  # ratio con 3 decimales
    if c.priority == "hard":
        def build(lit):
            for d in pm.days:
                a = pm.daily_nut.get((d, num_code))
                b = pm.daily_nut.get((d, den_code))
                if a is None or b is None:
                    continue
                if bound == "min":
                    pm.model.Add(a * den >= num * b).OnlyEnforceIf(lit)
                else:
                    pm.model.Add(a * den <= num * b).OnlyEnforceIf(lit)
        hard_enforce(c, build)
    else:
        # el soft de ratio requiere linealizar un cociente; no se modela en v0.
        # se avisa para no silenciar una restriccion que el profesional puso.
        applied.warnings.append(
            f"Soft nutrient_ratio (id {c.id}) is not modeled in this version and was ignored."
        )


def _h_forbid_food(c, pm, applied, hard_enforce, tags, ncodes, mcodes, w):
    fid = c.target_food_id
    if fid is None or fid not in pm.food_index:
        return
    hard_enforce(c, lambda lit: [
        pm.model.Add(pm.x[(fid, d, m)] == 0).OnlyEnforceIf(lit)
        for d in pm.days for m in pm.meals
    ])


def _h_forbid_tag(c, pm, applied, hard_enforce, tags, ncodes, mcodes, w):
    if c.target_tag_id is None:
        return
    members = _foods_with_tag(tags, c.target_tag_id)
    hard_enforce(c, lambda lit: [
        pm.model.Add(pm.x[(fid, d, m)] == 0).OnlyEnforceIf(lit)
        for fid in members for d in pm.days for m in pm.meals
    ])


def _h_prefer_food(c, pm, applied, hard_enforce, tags, ncodes, mcodes, w):
    fid = c.target_food_id
    if fid is None or fid not in pm.food_index:
        return
    meal_ctx = c.context.get("meal_type")
    appearances = []
    for d in pm.days:
        for mi, m in enumerate(pm.meals):
            if meal_ctx and mi < len(mcodes) and mcodes[mi] != meal_ctx:
                continue
            appearances.append(pm.x[(fid, d, m)])
    if appearances:
        applied.obj.add_bonus(w.w_prefer * c.weight, sum(appearances))


def _h_prefer_tag(c, pm, applied, hard_enforce, tags, ncodes, mcodes, w):
    if c.target_tag_id is None:
        return
    members = _foods_with_tag(tags, c.target_tag_id)
    appearances = [pm.x[(fid, d, m)] for fid in members for d in pm.days for m in pm.meals]
    if appearances:
        applied.obj.add_bonus(w.w_prefer * c.weight, sum(appearances))


def _h_meal_kcal_ratio(c, pm, applied, hard_enforce, tags, ncodes, mcodes, w):
    split = c.context.get("split") or {}
    if not split:
        return
    upper = pm.nut_upper.get(C.KCAL_CODE, 0) * 1000
    devs = []
    for d in pm.days:
        dk = pm.daily_nut.get((d, C.KCAL_CODE))
        if dk is None:
            continue
        for mi, m in enumerate(pm.meals):
            if mi >= len(mcodes):
                continue
            pct = split.get(mcodes[mi])
            if pct is None:
                continue
            mk = pm.meal_nut.get((d, m, C.KCAL_CODE))
            if mk is None:
                continue
            # |kcal_meal - (pct/100) * kcal_dia|, escalado x1000 para conservar
            # un decimal del porcentaje: kcal_meal*1000 - round(pct*10)*kcal_dia.
            pct_scaled = round(float(pct) * 10)
            diff_over = pm.model.NewIntVar(0, upper, f"mkro_{c.id}_{d}_{m}")
            diff_under = pm.model.NewIntVar(0, upper, f"mkru_{c.id}_{d}_{m}")
            pm.model.Add(mk * 1000 - pct_scaled * dk == diff_over - diff_under)
            devs.append(diff_over + diff_under)
    if devs:
        applied.obj.add_penalty(w.w_kcal * c.weight, sum(devs))
        applied.obj.soft_devs.append((c, sum(devs)))


def _members_for_target(c, pm, tags):
    """Alimentos que afecta la restriccion: uno concreto o toda una familia."""
    if c.target_food_id is not None:
        return [c.target_food_id] if c.target_food_id in pm.food_index else []
    if c.target_tag_id is not None:
        return _foods_with_tag(tags, c.target_tag_id)
    return []


def _h_max_servings(c, pm, applied, hard_enforce, tags, ncodes, mcodes, w):
    if c.value is None:
        return
    members = _members_for_target(c, pm, tags)
    if not members:
        return
    window = int(c.context.get("window_days", len(pm.days)))
    cap = int(c.value)

    def windows():
        for start in pm.days:
            wdays = [d for d in range(start, start + window) if d <= pm.days[-1]]
            if wdays:
                yield wdays

    if c.priority == "hard":
        def build(lit):
            for wdays in windows():
                appearances = [pm.x[(fid, d, m)] for fid in members for d in wdays for m in pm.meals]
                pm.model.Add(sum(appearances) <= cap).OnlyEnforceIf(lit)
        hard_enforce(c, build)
    else:
        devs = []
        for wi, wdays in enumerate(windows()):
            appearances = [pm.x[(fid, d, m)] for fid in members for d in wdays for m in pm.meals]
            over = pm.model.NewIntVar(0, len(appearances), f"msp_{c.id}_{wi}")
            pm.model.Add(over >= sum(appearances) - cap)
            devs.append(over)
        if devs:
            applied.obj.add_penalty(w.w_no_repeat * c.weight, sum(devs))
            applied.obj.soft_devs.append((c, sum(devs)))


def _h_no_repeat_food(c, pm, applied, hard_enforce, tags, ncodes, mcodes, w):
    fid = c.target_food_id
    if fid is None or fid not in pm.food_index or c.value is None:
        return
    sep = int(c.value)
    _no_repeat_windows(c, pm, applied, hard_enforce, w, [fid], sep, f"nrf_{c.id}")


def _h_no_repeat_tag(c, pm, applied, hard_enforce, tags, ncodes, mcodes, w):
    if c.target_tag_id is None or c.value is None:
        return
    members = _foods_with_tag(tags, c.target_tag_id)
    if not members:
        return
    sep = int(c.value)
    _no_repeat_windows(c, pm, applied, hard_enforce, w, members, sep, f"nrt_{c.id}")


def _no_repeat_windows(c, pm, applied, hard_enforce, w, members, sep, tag):
    # presencia de los alimentos por dia (max sobre las comidas del dia).
    present_by_day = {}
    for d in pm.days:
        p = pm.model.NewBoolVar(f"{tag}_pres_{d}")
        pm.model.AddMaxEquality(p, [pm.x[(fid, d, m)] for fid in members for m in pm.meals])
        present_by_day[d] = p

    def build_windows():
        for start in pm.days:
            wdays = [d for d in range(start, start + sep) if d <= pm.days[-1]]
            if len(wdays) > 1:
                yield wdays

    if c.priority == "hard":
        def build(lit):
            for wdays in build_windows():
                pm.model.Add(sum(present_by_day[d] for d in wdays) <= 1).OnlyEnforceIf(lit)
        hard_enforce(c, build)
    else:
        devs = []
        for wi, wdays in enumerate(build_windows()):
            over = pm.model.NewIntVar(0, len(wdays), f"{tag}_over_{wi}")
            pm.model.Add(over >= sum(present_by_day[d] for d in wdays) - 1)
            devs.append(over)
        if devs:
            applied.obj.add_penalty(w.w_no_repeat * c.weight, sum(devs))
            applied.obj.soft_devs.append((c, sum(devs)))


def _h_forbid_combination(c, pm, applied, hard_enforce, tags, ncodes, mcodes, w):
    first = _members_for_target(c, pm, tags)
    combine = c.context.get("combine_with") or {}
    if "food_id" in combine:
        fid = combine["food_id"]
        second = [fid] if fid in pm.food_index else []
    elif "tag_id" in combine:
        second = _foods_with_tag(tags, combine["tag_id"])
    else:
        second = []
    if not first or not second:
        return

    def build(lit):
        for d in pm.days:
            for m in pm.meals:
                # indicadores de "algun miembro del grupo presente en la comida".
                a = pm.model.NewBoolVar(f"fc_a_{c.id}_{d}_{m}")
                b = pm.model.NewBoolVar(f"fc_b_{c.id}_{d}_{m}")
                pm.model.AddMaxEquality(a, [pm.x[(fid, d, m)] for fid in first])
                pm.model.AddMaxEquality(b, [pm.x[(fid, d, m)] for fid in second])
                pm.model.Add(a + b <= 1).OnlyEnforceIf(lit)
    hard_enforce(c, build)


_HANDLERS: dict[str, Callable] = {
    "kcal_target": _h_kcal_target,
    "macro_target": _h_macro_target,
    "nutrient_min": _h_nutrient_min,
    "nutrient_max": _h_nutrient_max,
    "nutrient_ratio": _h_nutrient_ratio,
    "forbid_food": _h_forbid_food,
    "forbid_tag": _h_forbid_tag,
    "prefer_food": _h_prefer_food,
    "prefer_tag": _h_prefer_tag,
    "meal_kcal_ratio": _h_meal_kcal_ratio,
    "max_servings_per_period": _h_max_servings,
    "no_repeat_food": _h_no_repeat_food,
    "no_repeat_tag": _h_no_repeat_tag,
    "forbid_combination": _h_forbid_combination,
    # meals_per_day y plan_duration_days son estructurales, no generan restriccion.
}
