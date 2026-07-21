"""Construccion del modelo CP-SAT: variables y restricciones estructurales.

Aqui viven las variables de decision (presencia booleana y gramos enteros) y las
restricciones invariantes que se aplican siempre: presencia minima por comida,
cota de items, suelo calorico de Mifflin-St Jeor, rangos humanos de macros y
variedad semanal. Las restricciones configurables se anaden en catalog.py.

Escala entera. Un nutriente aportado por un alimento es value_per_100g * g / 100.
Para no dividir dentro del modelo, se guarda value_per_100g escalado a entero
(x NUTRIENT_SCALE) y no se divide por 100; asi la suma
  sum(scaled_100(f) * g[f,d,m])
representa el nutriente real multiplicado por (100 * NUTRIENT_SCALE). El helper
scale_target lleva un valor en unidad real a esa misma escala para compararlos.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from ortools.sat.python import cp_model

from . import config as C
from .types import ClientProfile, Food


def scaled_100(food: Food, code: str) -> int:
    """value_per_100g del nutriente, escalado a entero. 0 si no hay dato."""
    return round(food.nutrients.get(code, 0.0) * C.NUTRIENT_SCALE)


def scale_target(value: float) -> int:
    """Lleva un valor en unidad real a la escala de las sumas de nutriente."""
    return round(value * C.NUTRIENT_SCALE * 100)


def mifflin_bmr(client: ClientProfile) -> float:
    sex = client.sex or C.DEFAULT_SEX
    w = client.weight_kg if client.weight_kg is not None else C.DEFAULT_WEIGHT_KG
    h = client.height_cm if client.height_cm is not None else C.DEFAULT_HEIGHT_CM
    a = client.age if client.age is not None else C.DEFAULT_AGE
    base = 10 * w + 6.25 * h - 5 * a
    return base + 5 if sex == "M" else base - 161


def daily_kcal_floor(client: ClientProfile, warnings: list[str]) -> int:
    """Suelo calorico diario de seguridad: max(BMR, suelo por sexo).

    Es el metabolismo basal, no el gasto total. El gasto total (BMR x actividad)
    orienta el objetivo calorico que fije el profesional, pero el suelo duro que
    ninguna dieta puede cruzar es el basal, para permitir planes de deficit.
    """
    sex = client.sex or C.DEFAULT_SEX
    floor = C.FLOOR_KCAL.get(sex, C.FLOOR_KCAL["X"])
    if client.weight_kg is None or client.height_cm is None or client.age is None:
        warnings.append(
            "Missing anthropometric data, using the sex-based calorie floor."
        )
        return floor
    return max(round(mifflin_bmr(client)), floor)


@dataclass
class PlanModel:
    """Modelo construido: variables y sumas escaladas reutilizables."""

    model: cp_model.CpModel
    foods: list[Food]
    days: list[int]
    meals: list[int]
    x: dict[tuple[int, int, int], cp_model.IntVar]
    g: dict[tuple[int, int, int], cp_model.IntVar]
    # sumas escaladas por dia y por (dia, comida), por code de nutriente.
    daily_nut: dict[tuple[int, str], cp_model.IntVar] = field(default_factory=dict)
    meal_nut: dict[tuple[int, int, str], cp_model.IntVar] = field(default_factory=dict)
    # cota superior de la suma diaria de cada nutriente, para dimensionar las
    # variables auxiliares del objetivo sin sobredimensionar dominios.
    nut_upper: dict[str, int] = field(default_factory=dict)
    kcal_floor: int = 0
    food_index: dict[int, Food] = field(default_factory=dict)


def _nutrient_codes_in_use(foods: list[Food]) -> set[str]:
    codes: set[str] = set()
    for f in foods:
        codes.update(f.nutrients.keys())
    return codes


def build_base_model(
    client: ClientProfile,
    duration_days: int,
    meals_per_day: int,
    foods: list[Food],
    warnings: list[str],
) -> PlanModel:
    model = cp_model.CpModel()
    days = list(range(1, duration_days + 1))
    meals = list(range(1, meals_per_day + 1))

    x: dict[tuple[int, int, int], cp_model.IntVar] = {}
    g: dict[tuple[int, int, int], cp_model.IntVar] = {}
    for f in foods:
        for d in days:
            for m in meals:
                key = (f.id, d, m)
                x[key] = model.NewBoolVar(f"x_{f.id}_{d}_{m}")
                g[key] = model.NewIntVar(0, C.GRAMS_MAX, f"g_{f.id}_{d}_{m}")
                model.Add(g[key] >= C.MIN_GRAMS_PRESENT).OnlyEnforceIf(x[key])
                model.Add(g[key] == 0).OnlyEnforceIf(x[key].Not())

    pm = PlanModel(
        model=model, foods=foods, days=days, meals=meals, x=x, g=g,
        food_index={f.id: f for f in foods},
    )

    # sumas escaladas de nutriente, precomputadas para reuso. la cota de cada
    # suma se deriva del maximo real del nutriente en el pool, no de una holgura
    # arbitraria, para no inflar dominios (afecta a las auxiliares del objetivo).
    codes = _nutrient_codes_in_use(foods)
    for code in codes:
        max_100 = max((scaled_100(f, code) for f in foods), default=0)
        max_meal = C.GRAMS_MAX * len(foods) * max_100
        max_day = max_meal * len(meals)
        pm.nut_upper[code] = max_day
        for d in days:
            for m in meals:
                terms = [scaled_100(f, code) * g[(f.id, d, m)] for f in foods]
                mv = model.NewIntVar(0, max_meal, f"mn_{code}_{d}_{m}")
                model.Add(mv == sum(terms))
                pm.meal_nut[(d, m, code)] = mv
            dv = model.NewIntVar(0, max_day, f"dn_{code}_{d}")
            model.Add(dv == sum(pm.meal_nut[(d, mm, code)] for mm in meals))
            pm.daily_nut[(d, code)] = dv

    _structural_constraints(pm, client, warnings)
    return pm


def _structural_constraints(
    pm: PlanModel, client: ClientProfile, warnings: list[str]
) -> None:
    model, foods, days, meals = pm.model, pm.foods, pm.days, pm.meals

    # structural rule 1: at least one food per meal, no empty meals.
    # structural rule 2: cap on distinct foods per meal.
    for d in days:
        for m in meals:
            present = [pm.x[(f.id, d, m)] for f in foods]
            model.Add(sum(present) >= 1)
            model.Add(sum(present) <= C.MAX_ITEMS_PER_MEAL)

    # structural rule 3: daily calorie floor. the floor is the basal metabolic
    # rate (Mifflin), not total expenditure, so weight-loss plans stay feasible.
    pm.kcal_floor = daily_kcal_floor(client, warnings)
    for d in days:
        if (d, C.KCAL_CODE) in pm.daily_nut:
            model.Add(pm.daily_nut[(d, C.KCAL_CODE)] >= scale_target(pm.kcal_floor))

    # structural rule 4: human protein range (g per kg of body weight).
    # structural rule 5: minimum fat as a share of daily energy. from
    # fat_g * 9 >= pct/100 * kcal, cleared of the division on the scaled sums:
    # fat_scaled * 9 * 100 >= pct * kcal_scaled.
    weight = client.weight_kg if client.weight_kg is not None else C.DEFAULT_WEIGHT_KG
    prot_min = C.PROTEIN_G_PER_KG[0] * weight
    prot_max = C.PROTEIN_G_PER_KG[1] * weight
    for d in days:
        if (d, C.PROTEIN_CODE) in pm.daily_nut:
            model.Add(pm.daily_nut[(d, C.PROTEIN_CODE)] >= scale_target(prot_min))
            model.Add(pm.daily_nut[(d, C.PROTEIN_CODE)] <= scale_target(prot_max))
        if (d, C.FAT_CODE) in pm.daily_nut and (d, C.KCAL_CODE) in pm.daily_nut:
            model.Add(
                pm.daily_nut[(d, C.FAT_CODE)] * C.KCAL_PER_G[C.FAT_CODE] * 100
                >= C.FAT_MIN_PCT_ENERGY * pm.daily_nut[(d, C.KCAL_CODE)]
            )

    # structural rule 6: a food appears at most MAX_SAME_FOOD_PER_DAY times
    # across the meals of a single day.
    for f in foods:
        for d in days:
            model.Add(
                sum(pm.x[(f.id, d, m)] for m in meals) <= C.MAX_SAME_FOOD_PER_DAY
            )

    # structural rule 7: minimum distinct foods per day, not just per week.
    # daily presence used_day[f,d] = max of x over the day's meals.
    per_day_target = min(C.MIN_DISTINCT_PER_DAY, len(foods))
    for d in days:
        used = []
        for f in foods:
            u = model.NewBoolVar(f"used_day_{f.id}_{d}")
            model.AddMaxEquality(u, [pm.x[(f.id, d, m)] for m in meals])
            used.append(u)
        model.Add(sum(used) >= per_day_target)

    # structural rule 8: minimum distinct foods in each 7-day window, for plans
    # of at least a week.
    if len(days) >= 7:
        for start in range(1, len(days) - 5):
            window = list(range(start, start + 7))
            used = []
            for f in foods:
                u = model.NewBoolVar(f"used_{f.id}_{start}")
                model.AddMaxEquality(
                    u, [pm.x[(f.id, d, m)] for d in window for m in meals]
                )
                used.append(u)
            target = min(C.MIN_DISTINCT_PER_WEEK, len(foods))
            model.Add(sum(used) >= target)
