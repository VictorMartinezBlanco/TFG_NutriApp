"""Construccion del modelo CP-SAT: variables y restricciones invariantes.

Aqui viven las variables de decision (presencia booleana, gramos enteros y
unidades para los alimentos por piezas) y las dos familias de restricciones que
se aplican siempre: las estructurales (structural rules 1-8: presencia y cota de
items por comida, suelo calorico de Mifflin-St Jeor, rangos humanos de macros,
no repetir en el dia y variedad diaria y semanal) y las de plausibilidad del
catalogo (plausibility rules 9-15: perfil de racion, unidades, franjas del dia,
composicion de comidas, condimentos y dulce/fruta). Las restricciones
configurables se anaden en catalog.py.

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


def serving_bounds(food: Food) -> tuple[int, int]:
    """Gramos minimos y maximos por aparicion segun el perfil del alimento.

    Sin perfil (alimentos custom sin datos) se usan los fallbacks globales,
    acotados por los limites duros historicos.
    """
    lo = food.min_serving_g if food.min_serving_g is not None else C.FALLBACK_MIN_SERVING_G
    hi = food.max_serving_g if food.max_serving_g is not None else C.FALLBACK_MAX_SERVING_G
    return max(round(lo), C.MIN_GRAMS_PRESENT), round(hi)


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
    meal_codes: list[str],
    warnings: list[str],
) -> PlanModel:
    model = cp_model.CpModel()
    days = list(range(1, duration_days + 1))
    meals = list(range(1, meals_per_day + 1))

    # plausibility rule 9: presence implies a serving within the food's own
    # profile [min, max], not within global limits. plausibility rule 10: foods
    # served by the piece quantize their grams to half units, 2*g = k*gpu with
    # k integer; foods in WHOLE_UNIT_FOOD_NAMES allow whole pieces only.
    x: dict[tuple[int, int, int], cp_model.IntVar] = {}
    g: dict[tuple[int, int, int], cp_model.IntVar] = {}
    for f in foods:
        lo, hi = serving_bounds(f)
        gpu = round(f.grams_per_unit) if f.grams_per_unit is not None else None
        for d in days:
            for m in meals:
                key = (f.id, d, m)
                x[key] = model.NewBoolVar(f"x_{f.id}_{d}_{m}")
                g[key] = model.NewIntVar(0, hi, f"g_{f.id}_{d}_{m}")
                model.Add(g[key] >= lo).OnlyEnforceIf(x[key])
                model.Add(g[key] == 0).OnlyEnforceIf(x[key].Not())
                if gpu:
                    if f.name in C.WHOLE_UNIT_FOOD_NAMES:
                        k = model.NewIntVar(0, hi // gpu, f"k_{f.id}_{d}_{m}")
                        model.Add(g[key] == k * gpu)
                    else:
                        k = model.NewIntVar(0, (2 * hi) // gpu, f"k_{f.id}_{d}_{m}")
                        model.Add(2 * g[key] == k * gpu)

    pm = PlanModel(
        model=model, foods=foods, days=days, meals=meals, x=x, g=g,
        food_index={f.id: f for f in foods},
    )

    # sumas escaladas de nutriente, precomputadas para reuso. la cota de cada
    # suma es la mayor aportacion alcanzable de verdad en una comida: como una
    # comida lleva a lo sumo MAX_ITEMS_PER_MEAL alimentos distintos, basta la
    # suma de las mayores contribuciones individuales (racion maxima del
    # alimento por su densidad), no el catalogo entero a la vez. dominios mas
    # ajustados propagan mejor (afecta a las auxiliares del objetivo).
    codes = _nutrient_codes_in_use(foods)
    for code in codes:
        contribs = sorted(
            (serving_bounds(f)[1] * scaled_100(f, code) for f in foods),
            reverse=True,
        )
        max_meal = sum(contribs[:C.MAX_ITEMS_PER_MEAL])
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
    _plausibility_constraints(pm, meal_codes, warnings)
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


def _plausibility_constraints(
    pm: PlanModel, meal_codes: list[str], warnings: list[str]
) -> None:
    """Reglas de plausibilidad del catalogo (plausibility rules 11-15), duras.

    Acotan dominio con el vocabulario del catalogo (roles y franjas): que cada
    comida parezca una comida, no una combinacion legal de cantidades. Las
    reglas 9 y 10 (perfil de racion y unidades) viven en el enlace x-g de
    build_base_model. Ninguna lleva literal de asuncion: no son relajables por
    el profesional y no entran en el nucleo de infactibilidad.
    """
    model, foods, days, meals = pm.model, pm.foods, pm.days, pm.meals

    code_of = {m: meal_codes[m - 1] for m in meals if m - 1 < len(meal_codes)}
    condiments = [f for f in foods if C.CONDIMENT_TAG in f.tag_codes]
    others = [f for f in foods if C.CONDIMENT_TAG not in f.tag_codes]
    sweetish = [
        f for f in foods
        if C.SWEET_TAG in f.tag_codes or C.FRUIT_TAG in f.tag_codes
    ]

    # plausibility rule 11: slot whitelist. a food with moment tags can only
    # appear in those meal slots.
    for f in foods:
        allowed = {
            t[len(C.MOMENT_TAG_PREFIX):]
            for t in f.tag_codes
            if t.startswith(C.MOMENT_TAG_PREFIX)
        }
        if not allowed:
            continue
        for d in days:
            for m in meals:
                if code_of.get(m) not in allowed:
                    model.Add(pm.x[(f.id, d, m)] == 0)

    # plausibility rule 12: main meals ask for composition, not a lone item.
    # snack slots keep the structural minimum of one.
    min_main = min(C.MIN_ITEMS_MAIN_MEAL, len(foods))
    for d in days:
        for m in meals:
            if code_of.get(m) in C.MAIN_MEAL_CODES:
                model.Add(sum(pm.x[(f.id, d, m)] for f in foods) >= min_main)

    # plausibility rule 13: a condiment never goes alone, something must
    # accompany it in the same meal.
    if condiments and others:
        for d in days:
            for m in meals:
                company = sum(pm.x[(f.id, d, m)] for f in others)
                for f in condiments:
                    model.Add(pm.x[(f.id, d, m)] <= company)
    elif condiments:
        warnings.append(
            "Food pool has only condiments; the accompaniment rule was skipped."
        )

    # plausibility rule 14: daily cap on condiment appearances, combined.
    if condiments:
        for d in days:
            model.Add(
                sum(pm.x[(f.id, d, m)] for f in condiments for m in meals)
                <= C.CONDIMENT_MAX_PER_DAY
            )

    # plausibility rule 15: sweets and fruit are a complement, at most one per
    # meal between both. with rule 12 this also keeps fruit from being the
    # whole of a main meal.
    if sweetish:
        for d in days:
            for m in meals:
                model.Add(
                    sum(pm.x[(f.id, d, m)] for f in sweetish)
                    <= C.SWEET_FRUIT_MAX_PER_MEAL
                )
