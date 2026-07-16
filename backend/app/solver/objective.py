"""Ensamblaje de la funcion objetivo.

Suma ponderada de penalizaciones menos bonificaciones. El peso efectivo de cada
termino ya viene aplicado desde los handlers (peso de familia x peso de fila), asi
que aqui solo se agregan. Se anade una penalizacion de variedad global suave para
empujar a usar mas alimentos distintos cuando nada mas lo decide.
"""

from __future__ import annotations

import math

from ortools.sat.python import cp_model

from . import config as C
from .catalog import ObjectiveTerms
from .model import PlanModel


def set_objective(pm: PlanModel, obj: ObjectiveTerms, weights: C.ObjectiveWeights) -> None:
    terms = list(obj.penalties)
    for b in obj.bonuses:
        terms.append(-b)

    # variedad: penaliza cada alimento no usado en todo el plan, suavemente.
    variety_penalty = _variety_penalty(pm)
    if variety_penalty is not None:
        terms.append(weights.w_variety * variety_penalty)

    # reparto: penaliza que un mismo alimento aparezca demasiadas veces en todo
    # el plan, para que la ingesta se distribuya en vez de concentrarse.
    spread_penalty = _spread_penalty(pm)
    if spread_penalty is not None:
        terms.append(weights.w_spread * spread_penalty)

    if terms:
        pm.model.Minimize(sum(terms))


def _variety_penalty(pm: PlanModel):
    if not pm.foods:
        return None
    unused = []
    for f in pm.foods:
        u = pm.model.NewBoolVar(f"var_used_{f.id}")
        pm.model.AddMaxEquality(
            u, [pm.x[(f.id, d, m)] for d in pm.days for m in pm.meals]
        )
        nu = pm.model.NewBoolVar(f"var_unused_{f.id}")
        pm.model.Add(nu == 1 - u)
        unused.append(nu)
    return sum(unused)


def _spread_penalty(pm: PlanModel):
    if not pm.foods:
        return None
    cap = max(1, math.ceil(C.MAX_APPEARANCES_PER_DAY_RATIO * len(pm.days)))
    slots = len(pm.days) * len(pm.meals)
    overs = []
    for f in pm.foods:
        appearances = sum(pm.x[(f.id, d, m)] for d in pm.days for m in pm.meals)
        over = pm.model.NewIntVar(0, slots, f"spread_over_{f.id}")
        pm.model.Add(over >= appearances - cap)
        overs.append(over)
    return sum(overs)
