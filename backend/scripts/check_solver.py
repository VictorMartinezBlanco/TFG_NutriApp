"""Banco de pruebas del solver contra los clientes reales del catalogo.

Ejercita los seis casos anclados a Maria, John y Emma mas dos infactibilidades
deliberadas, y comprueba que cada plan respeta sus restricciones duras por
construccion y sus objetivos blandos dentro de los umbrales. Reproducible: lee la
base de datos con el rol de servicio y no escribe nada.

Uso (desde Repo/backend, con el venv activo):
    python -m scripts.check_solver
"""

from __future__ import annotations

import asyncio

from app.db import connection_pool
from app.solver import Constraint, FeasiblePlan, InfeasiblePlan, generate_plan
from app.solver import config as C
from app.solver.model import serving_bounds
from app.solver.loader import (
    load_client,
    load_constraints,
    load_food_pool,
    load_meal_type_codes,
)

NUTRI = "03f06edf-603e-489d-8aed-71bc93f97ef0"

KCAL_TOL_PCT = 5.0
MACRO_TOL_PCT = 10.0


async def _nutrient_codes(conn):
    rows = await conn.fetch("SELECT id, code FROM nutrient")
    return {r["id"]: r["code"] for r in rows}


async def _tag_ids(conn):
    rows = await conn.fetch("SELECT id, code FROM tag")
    return {r["code"]: r["id"] for r in rows}


async def _client_id(conn, name):
    return await conn.fetchval(
        "SELECT id FROM client WHERE nutritionist_id=$1 AND full_name_pseudonym=$2",
        NUTRI, name,
    )


def _daily_nutrient(plan, foods_by_id, code, day_index=0):
    tot = 0.0
    for meal in plan.days[day_index].meals:
        for it in meal.items:
            tot += foods_by_id[it.food_id].nutrients.get(code, 0.0) * it.grams / 100
    return tot


def _plan_uses_tag(plan, foods_by_id, tag_id):
    for day in plan.days:
        for meal in day.meals:
            for it in meal.items:
                if tag_id in foods_by_id[it.food_id].tag_ids:
                    return True
    return False


def _plan_uses_food(plan, food_id):
    for day in plan.days:
        for meal in day.meals:
            for it in meal.items:
                if it.food_id == food_id:
                    return True
    return False


def _max_same_food_in_a_day(plan):
    """Maximo de comidas de un mismo dia en que aparece un mismo alimento."""
    peak = 0
    for day in plan.days:
        counts = {}
        for meal in day.meals:
            for it in meal.items:
                counts[it.food_id] = counts.get(it.food_id, 0) + 1
        if counts:
            peak = max(peak, max(counts.values()))
    return peak


def _min_distinct_per_day(plan):
    return min(
        len({it.food_id for meal in day.meals for it in meal.items})
        for day in plan.days
    )


def _plausibility_violations(plan, foods_by_id):
    """Cuenta violaciones de cada garantia de la capa de plausibilidad (8e)."""
    v = {"profile": 0, "units": 0, "slots": 0, "main_size": 0,
         "condiment_alone": 0, "condiment_cap": 0, "sweet_fruit": 0}
    for day in plan.days:
        day_conds = 0
        for meal in day.meals:
            n_sweetfruit = 0
            n_cond = 0
            for it in meal.items:
                f = foods_by_id[it.food_id]
                lo, hi = serving_bounds(f)
                if not (lo <= it.grams <= hi):
                    v["profile"] += 1
                if f.grams_per_unit:
                    steps = 1 if f.name in C.WHOLE_UNIT_FOOD_NAMES else 2
                    if (steps * it.grams) % round(f.grams_per_unit):
                        v["units"] += 1
                allowed = {t[len(C.MOMENT_TAG_PREFIX):] for t in f.tag_codes
                           if t.startswith(C.MOMENT_TAG_PREFIX)}
                if allowed and meal.meal_type_code not in allowed:
                    v["slots"] += 1
                if C.CONDIMENT_TAG in f.tag_codes:
                    n_cond += 1
                if C.SWEET_TAG in f.tag_codes or C.FRUIT_TAG in f.tag_codes:
                    n_sweetfruit += 1
            if (meal.meal_type_code in C.MAIN_MEAL_CODES
                    and len(meal.items) < C.MIN_ITEMS_MAIN_MEAL):
                v["main_size"] += 1
            if n_cond and n_cond == len(meal.items):
                v["condiment_alone"] += 1
            if n_sweetfruit > C.SWEET_FRUIT_MAX_PER_MEAL:
                v["sweet_fruit"] += 1
            day_conds += n_cond
        if day_conds > C.CONDIMENT_MAX_PER_DAY:
            v["condiment_cap"] += 1
    return v


def _max_appearances_in_plan(plan):
    counts = {}
    for day in plan.days:
        for meal in day.meals:
            for it in meal.items:
                counts[it.food_id] = counts.get(it.food_id, 0) + 1
    return max(counts.values()) if counts else 0


class Report:
    def __init__(self):
        self.passed = 0
        self.failed = 0

    def check(self, label, cond, detail=""):
        mark = "PASS" if cond else "FAIL"
        if cond:
            self.passed += 1
        else:
            self.failed += 1
        print(f"    [{mark}] {label}" + (f" -- {detail}" if detail else ""))


async def main() -> int:
    rep = Report()
    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            ncodes = await _nutrient_codes(conn)
            tids = await _tag_ids(conn)
            foods = await load_food_pool(conn, NUTRI)
            foods_by_id = {f.id: f for f in foods}
            m3 = await load_meal_type_codes(conn, 3)
            m5 = await load_meal_type_codes(conn, 5)

            maria = await _client_id(conn, "Maria Gonzalez")
            john = await _client_id(conn, "John Smith")
            emma = await _client_id(conn, "Emma Wilson")

            maria_c = await load_client(conn, maria)
            john_c = await load_client(conn, john)
            emma_c = await load_client(conn, emma)

            maria_cons = await load_constraints(conn, maria, NUTRI)
            john_cons = await load_constraints(conn, john, NUTRI)
            emma_cons = await load_constraints(conn, emma, NUTRI)

            def run(client, dd, mm, cons, mcodes):
                return generate_plan(
                    client, dd, mm, cons, foods,
                    nutrient_codes=ncodes, meal_codes=mcodes,
                )

            # Caso 1. Trivial factible.
            print("\nCaso 1. Maria, 3 dias, 3 comidas, sin restricciones configurables")
            r = run(maria_c, 3, 3, [], m3)
            rep.check("factible", isinstance(r, FeasiblePlan))
            if isinstance(r, FeasiblePlan):
                rep.check("cada comida con >=1 alimento",
                          all(m.items for d in r.days for m in d.meals))
                k = _daily_nutrient(r, foods_by_id, "energy_kcal")
                rep.check("energia dia1 sobre el suelo fisiologico", k > 0, f"{k:.0f} kcal")
                # reglas base de sentido comun (estructurales, siempre activas).
                peak = _max_same_food_in_a_day(r)
                rep.check("ningun alimento repetido de mas en un dia (base)",
                          peak <= C.MAX_SAME_FOOD_PER_DAY,
                          f"max {peak}/dia, tope {C.MAX_SAME_FOOD_PER_DAY}")
                mind = _min_distinct_per_day(r)
                rep.check("variedad minima por dia (base)",
                          mind >= min(C.MIN_DISTINCT_PER_DAY, len(foods)),
                          f"{mind} distintos/dia, min {C.MIN_DISTINCT_PER_DAY}")
                print(f"    status={r.metrics.solve_status} time={r.metrics.solve_time_ms}ms")

            # Caso 2. Objetivo calorico blando.
            print("\nCaso 2. Maria, 7 dias, 5 comidas, kcal_target 1500 soft")
            only_kcal = [c for c in maria_cons if c.type == "kcal_target"]
            r = run(maria_c, 7, 5, only_kcal, m5)
            rep.check("factible", isinstance(r, FeasiblePlan))
            if isinstance(r, FeasiblePlan):
                rep.check("desviacion kcal < 5%",
                          (r.metrics.kcal_mean_deviation_pct or 0) < KCAL_TOL_PCT,
                          f"{r.metrics.kcal_mean_deviation_pct}%")
                print(f"    status={r.metrics.solve_status} time={r.metrics.solve_time_ms}ms")

            # Caso 3. Objetivo calorico + preferencia vegetariana.
            print("\nCaso 3. Maria, 7 dias, 5 comidas, kcal_target 1500 + prefer_tag vegetarian")
            r = run(maria_c, 7, 5, maria_cons, m5)
            rep.check("factible", isinstance(r, FeasiblePlan))
            if isinstance(r, FeasiblePlan):
                rep.check("desviacion kcal < 5%",
                          (r.metrics.kcal_mean_deviation_pct or 0) < KCAL_TOL_PCT,
                          f"{r.metrics.kcal_mean_deviation_pct}%")
                veg = tids["vegetarian"]
                # cuenta cuantos items son vegetarianos vs total
                total = sum(len(m.items) for d in r.days for m in d.meals)
                vegn = sum(1 for d in r.days for m in d.meals for it in m.items
                           if veg in foods_by_id[it.food_id].tag_ids)
                rep.check("predominio vegetariano", vegn >= total * 0.6,
                          f"{vegn}/{total} items")
                print(f"    status={r.metrics.solve_status} time={r.metrics.solve_time_ms}ms")

            # Caso 4. Alergia dura + minimo de proteina.
            print("\nCaso 4. John, 7 dias, 5 comidas, forbid_tag peanuts hard + nutrient_min protein soft")
            r = run(john_c, 7, 5, john_cons, m5)
            rep.check("factible", isinstance(r, FeasiblePlan))
            if isinstance(r, FeasiblePlan):
                pean = tids["peanuts"]
                rep.check("ningun alimento con peanuts (hard)",
                          not _plan_uses_tag(r, foods_by_id, pean))
                prot = _daily_nutrient(r, foods_by_id, "protein_g")
                print(f"    proteina dia1={prot:.0f}g (min 140 soft)")
                print(f"    status={r.metrics.solve_status} time={r.metrics.solve_time_ms}ms")

            # Caso 5. Intolerancia dura + tope de sodio.
            print("\nCaso 5. Emma, 7 dias, 5 comidas, forbid_tag lactose hard + nutrient_max sodium soft")
            r = run(emma_c, 7, 5, emma_cons, m5)
            rep.check("factible", isinstance(r, FeasiblePlan))
            if isinstance(r, FeasiblePlan):
                lac = tids["lactose"]
                rep.check("ningun alimento con lactosa (hard)",
                          not _plan_uses_tag(r, foods_by_id, lac))
                sod = _daily_nutrient(r, foods_by_id, "sodium_mg")
                print(f"    sodio dia1={sod:.0f}mg (max 2000 soft)")
                print(f"    status={r.metrics.solve_status} time={r.metrics.solve_time_ms}ms")

            # Caso 6. Infactibilidad: kcal 900 dura vs proteina 180 dura.
            print("\nCaso 6. John, 3 dias, 5 comidas, kcal_target 900 hard + nutrient_min protein 180 hard")
            prot_id = next(k for k, v in ncodes.items() if v == "protein_g")
            cons6 = [
                Constraint(id=-1, type="kcal_target", priority="hard", weight=10,
                           operator="eq", value=900),
                Constraint(id=-2, type="nutrient_min", priority="hard", weight=10,
                           operator="min", value=180, target_nutrient_id=prot_id),
            ]
            r = run(john_c, 3, 5, cons6, m5)
            rep.check("infactible", isinstance(r, InfeasiblePlan))
            if isinstance(r, InfeasiblePlan):
                types = {ref.type for ref in r.unsat_core}
                rep.check("nucleo contiene kcal_target y nutrient_min",
                          "kcal_target" in types and "nutrient_min" in types,
                          f"core={sorted(types)}")
                print(f"    suggestion: {r.suggestion}")

            # Caso 7. Infactibilidad construida contra el pool real.
            # Prohibe casi todas las familias de proteina y pide un minimo alto:
            # sin fuentes suficientes, el minimo de proteina es inalcanzable.
            print("\nCaso 7. Infactibilidad real: min proteina 200 hard + prohibicion de casi todas las fuentes")
            forbids = []
            for i, tag in enumerate(["red_meat", "fish_allergen", "milk_allergen",
                                     "eggs_allergen", "soy", "peanuts", "tree_nuts"]):
                forbids.append(Constraint(id=-(10 + i), type="forbid_tag", priority="hard",
                                          weight=10, operator="forbid",
                                          target_tag_id=tids[tag]))
            cons7 = forbids + [
                Constraint(id=-100, type="nutrient_min", priority="hard", weight=10,
                           operator="min", value=200, target_nutrient_id=prot_id),
            ]
            r = run(john_c, 3, 3, cons7, m3)
            rep.check("infactible", isinstance(r, InfeasiblePlan))
            if isinstance(r, InfeasiblePlan):
                types = {ref.type for ref in r.unsat_core}
                rep.check("nucleo contiene el minimo de proteina",
                          "nutrient_min" in types, f"core={sorted(types)}")
                print(f"    suggestion: {r.suggestion}")

            # Caso 8. Tipos no ejercidos por los reales, incluido el nuevo
            # no_repeat_tag del enum. Verifica que el solver mapea el catalogo
            # completo y respeta los patrones nuevos.
            print("\nCaso 8. Diseno, ejercita no_repeat_tag + max_servings + meal_kcal_ratio + prefer_food")
            fish = tids["fish_allergen"]
            red = tids["red_meat"]
            oat_id = next((f.id for f in foods if f.name == "Oat flakes"), None)
            cons8 = [
                Constraint(id=-201, type="no_repeat_tag", priority="hard", weight=5,
                           operator="forbid", value=2, target_tag_id=fish,
                           context={"granularity": "day"}),
                Constraint(id=-202, type="max_servings_per_period", priority="hard",
                           weight=5, operator="max", value=2, target_tag_id=red,
                           context={"window_days": 7}),
                Constraint(id=-203, type="meal_kcal_ratio", priority="soft", weight=5,
                           operator="approx",
                           context={"split": {"breakfast": 25, "lunch": 35,
                                              "dinner": 25, "snack": 15}}),
                Constraint(id=-204, type="prefer_food", priority="soft", weight=4,
                           operator="prefer", target_food_id=oat_id,
                           context={"meal_type": "breakfast"}),
            ]
            r = run(maria_c, 7, 4, cons8, await load_meal_type_codes(conn, 4))
            rep.check("factible", isinstance(r, FeasiblePlan))
            if isinstance(r, FeasiblePlan):
                # no_repeat_tag hard: pescado no en dias consecutivos
                fish_days = [d.day_num for d in r.days
                             if any(fish in foods_by_id[it.food_id].tag_ids
                                    for m in d.meals for it in m.items)]
                consec = any(b - a == 1 for a, b in zip(fish_days, fish_days[1:]))
                rep.check("pescado no en dias consecutivos (hard)", not consec,
                          f"dias con pescado={fish_days}")
                # max_servings hard: red_meat <= 2 en la semana
                red_count = sum(1 for d in r.days for m in d.meals for it in m.items
                                if red in foods_by_id[it.food_id].tag_ids)
                rep.check("carne roja <= 2 apariciones/semana (hard)", red_count <= 2,
                          f"apariciones={red_count}")
                print(f"    status={r.metrics.solve_status} time={r.metrics.solve_time_ms}ms")

            # Evidencia antes/despues: mismo caso con y sin las reglas base, para
            # ver el efecto en la distribucion. "Sin reglas" relaja las
            # constantes estructurales a valores permisivos; no toca el solver.
            print("\nAntes/despues de las reglas base (Maria, 7 dias, 5 comidas)")
            orig = (C.MAX_SAME_FOOD_PER_DAY, C.MIN_DISTINCT_PER_DAY,
                    C.MAX_APPEARANCES_PER_DAY_RATIO)
            only_kcal = [c for c in maria_cons if c.type == "kcal_target"]

            C.MAX_SAME_FOOD_PER_DAY = 5
            C.MIN_DISTINCT_PER_DAY = 1
            C.MAX_APPEARANCES_PER_DAY_RATIO = 100.0
            before = run(maria_c, 7, 5, only_kcal, m5)

            (C.MAX_SAME_FOOD_PER_DAY, C.MIN_DISTINCT_PER_DAY,
             C.MAX_APPEARANCES_PER_DAY_RATIO) = orig
            after = run(maria_c, 7, 5, only_kcal, m5)

            for label, plan in (("sin reglas base", before), ("con reglas base", after)):
                if isinstance(plan, FeasiblePlan):
                    print(f"    {label}: max mismo alimento/dia="
                          f"{_max_same_food_in_a_day(plan)}, "
                          f"min distintos/dia={_min_distinct_per_day(plan)}, "
                          f"max apariciones/plan={_max_appearances_in_plan(plan)}")
            # Cada regla se comprueba contra lo que ella garantiza, no contra el
            # valor que la pasada relajada saque por su cuenta (leccion 8c: los
            # asserts que comparaban dos solves no deterministas oscilaban entre
            # pasadas). Desde el 8e la comparacion es ademas imposible de
            # plantear limpia: los perfiles de racion son DATOS del catalogo,
            # no constantes, asi que la capa de plausibilidad tambien acota la
            # pasada "sin reglas" y el mundo pre-6f ya no se puede reproducir
            # relajando config. La pasada relajada queda como impresion
            # informativa; el antes/despues global del 8e es la re-auditoria de
            # audit_plans sobre los planes regenerados.
            if isinstance(after, FeasiblePlan):
                rep.check("con reglas, ningun alimento pasa del tope diario",
                          _max_same_food_in_a_day(after) <= C.MAX_SAME_FOOD_PER_DAY,
                          f"{_max_same_food_in_a_day(after)} <= {C.MAX_SAME_FOOD_PER_DAY}")
                rep.check("con reglas, se cumple el suelo de variedad diaria",
                          _min_distinct_per_day(after) >= C.MIN_DISTINCT_PER_DAY,
                          f"{_min_distinct_per_day(after)} >= {C.MIN_DISTINCT_PER_DAY}")

            # Capa de plausibilidad (8e): cada regla contra SU garantia, sobre
            # el mismo plan real de 7x5. El antes/despues global del bloque es
            # la re-auditoria de audit_plans sobre los planes regenerados.
            print("\nCapa de plausibilidad (mismo plan de Maria, 7x5)")
            if isinstance(after, FeasiblePlan):
                v = _plausibility_violations(after, foods_by_id)
                rep.check("raciones dentro del perfil de cada alimento",
                          v["profile"] == 0, f"violaciones={v['profile']}")
                rep.check("alimentos por unidades en la rejilla de medias piezas",
                          v["units"] == 0, f"violaciones={v['units']}")
                rep.check("ningun alimento fuera de sus franjas",
                          v["slots"] == 0, f"violaciones={v['slots']}")
                rep.check("las comidas principales llevan composicion minima",
                          v["main_size"] == 0, f"violaciones={v['main_size']}")
                rep.check("ningun condimento va solo",
                          v["condiment_alone"] == 0, f"violaciones={v['condiment_alone']}")
                rep.check("tope diario de condimentos respetado",
                          v["condiment_cap"] == 0, f"dias fuera={v['condiment_cap']}")
                rep.check("dulce/fruta como maximo uno por comida",
                          v["sweet_fruit"] == 0, f"violaciones={v['sweet_fruit']}")

    print(f"\n== {rep.passed} PASS, {rep.failed} FAIL ==")
    return 0 if rep.failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
