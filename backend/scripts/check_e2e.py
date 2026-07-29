"""Verificacion de extremo a extremo del pipeline sin IA contra la API.

Corre los doce casos de prueba del diseno contra el endpoint de generacion (por
defecto en local, o en la URL que diga NUTRIAPP_API_URL), comprueba el veredicto
esperado de cada uno y que el validador queda en verde donde toca. Ademas
demuestra el flujo completo generar -> validar -> persistir borrador -> firmar ->
firmado, y que generar para un cliente ajeno se rechaza. Reproducible: los planes
de prueba que persiste los borra al terminar.

Uso (desde Repo/backend, con el venv activo y la API levantada):
    NUTRIAPP_API_URL=http://127.0.0.1:8000 NUTRIAPP_API_TOKEN=... python -m scripts.check_e2e
"""

from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.request

from app.db import connection_pool

NUTRI = "03f06edf-603e-489d-8aed-71bc93f97ef0"
BASE = os.environ.get("NUTRIAPP_API_URL", "http://127.0.0.1:8000").rstrip("/")
TOKEN = os.environ.get("NUTRIAPP_API_TOKEN", "")

KCAL_TOL_PCT = 5.0


# Un caso que agota el limite del solver tarda los 90 s de resolucion mas la
# carga del pool, la validacion y la serializacion del plan, que en la CPU del
# free tier suman otros veinte y pico segundos. Con 120 s el cliente cortaba
# antes que el servidor.
HTTP_TIMEOUT_S = 240


def _call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if TOKEN:
        req.add_header("Authorization", f"Bearer {TOKEN}")
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_S) as r:
            return r.status, _parse(r.read())
    except urllib.error.HTTPError as e:
        return e.code, _parse(e.read())
    except Exception as e:  # noqa: BLE001
        # un corte de red o un timeout tiene que salir como FAIL del caso, no
        # tumbar la pasada entera y perder los casos que quedaban.
        return -1, {"detail": f"{type(e).__name__}: {e}"}


def _parse(raw):
    """El proxy del hosting contesta los errores con HTML, no con JSON."""
    try:
        return json.loads(raw.decode())
    except (ValueError, UnicodeDecodeError):
        return {"detail": raw.decode("utf-8", "replace")[:200]}


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


def _gen(nutri, client_id, dd, mm, constraints=None, persist=False):
    body = {
        "nutritionist_id": nutri,
        "client_id": client_id,
        "duration_days": dd,
        "meals_per_day": mm,
        "constraints": constraints or [],
        "persist": persist,
    }
    return _call("POST", "/plans/generate", body)


async def main() -> int:
    rep = Report()
    print(f"target: {BASE}")

    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            maria = await _cid(conn, "Maria Gonzalez")
            john = await _cid(conn, "John Smith")
            emma = await _cid(conn, "Emma Wilson")
            michael = await _cid(conn, "Michael Chen")
            tids = {r["code"]: r["id"] for r in await conn.fetch("SELECT id, code FROM tag")}
            prot = await conn.fetchval("SELECT id FROM nutrient WHERE code='protein_g'")
            calc = await conn.fetchval("SELECT id FROM nutrient WHERE code='calcium_mg'")
            sod = await conn.fetchval("SELECT id FROM nutrient WHERE code='sodium_mg'")
            oat = await conn.fetchval(
                "SELECT id FROM food WHERE name_en='Oat flakes' AND deleted_at IS NULL")
            other = await conn.fetchrow(
                "SELECT id, nutritionist_id FROM client WHERE nutritionist_id <> $1 "
                "AND deleted_at IS NULL LIMIT 1", NUTRI)

    # health primero: si la BD no responde desde el host, todo lo demas es ruido.
    print("\nSalud del servicio")
    s, b = _call("GET", "/health")
    rep.check("health 200 y BD accesible", s == 200 and b.get("status") == "ok", f"{s} {b}")

    # -- Casos anclados a clientes reales (1-6). Usan las constraints del seed. --

    print("\nCaso 1. Maria 3d/3c, sin constraints configurables. Factible.")
    s, b = _gen(NUTRI, maria, 3, 3)
    rep.check("factible", s == 200 and b["status"] == "feasible")
    if b.get("status") == "feasible":
        rep.check("cada comida con >=1 alimento",
                  all(m["items"] for d in b["plan"]["days"] for m in d["meals"]))
        rep.check("validador en verde", b["validation"]["passed"])

    print("\nCaso 2. Maria 7d/5c, kcal_target 1500 soft. Factible, desviacion < 5%.")
    s, b = _gen(NUTRI, maria, 7, 5, [
        {"type": "kcal_target", "operator": "eq", "value": 1500, "priority": "soft", "weight": 7}])
    rep.check("factible", s == 200 and b["status"] == "feasible")
    if b.get("status") == "feasible":
        dev = b["metrics"]["kcal_mean_deviation_pct"] or 0
        rep.check("desviacion kcal < 5%", dev < KCAL_TOL_PCT, f"{dev}%")
        rep.check("validador en verde", b["validation"]["passed"])

    print("\nCaso 3. Maria 7d/5c, kcal 1500 + prefer_tag vegetarian. Factible, predominio veg.")
    s, b = _gen(NUTRI, maria, 7, 5, [
        {"type": "kcal_target", "operator": "eq", "value": 1500, "priority": "soft", "weight": 7},
        {"type": "prefer_tag", "operator": "prefer", "target_tag_id": tids["vegetarian"],
         "priority": "soft", "weight": 4}])
    rep.check("factible", s == 200 and b["status"] == "feasible")

    print("\nCaso 4. John 7d/5c, forbid_tag peanuts hard + nutrient_min protein soft. Factible.")
    s, b = _gen(NUTRI, john, 7, 5, [
        {"type": "forbid_tag", "operator": "forbid", "target_tag_id": tids["peanuts"],
         "priority": "hard", "weight": 10},
        {"type": "nutrient_min", "operator": "min", "value": 140, "target_nutrient_id": prot,
         "priority": "soft", "weight": 6}])
    rep.check("factible", s == 200 and b["status"] == "feasible")
    if b.get("status") == "feasible":
        rep.check("validador en verde", b["validation"]["passed"])

    print("\nCaso 5. Emma 7d/5c, forbid_tag lactose hard + nutrient_max sodium soft. Factible.")
    s, b = _gen(NUTRI, emma, 7, 5, [
        {"type": "forbid_tag", "operator": "forbid", "target_tag_id": tids["lactose"],
         "priority": "hard", "weight": 9},
        {"type": "nutrient_max", "operator": "max", "value": 2000, "target_nutrient_id": sod,
         "priority": "soft", "weight": 7}])
    rep.check("factible", s == 200 and b["status"] == "feasible")

    print("\nCaso 6. John 3d/5c, kcal 900 hard + protein 180 hard. Infactible.")
    s, b = _gen(NUTRI, john, 3, 5, [
        {"type": "kcal_target", "operator": "eq", "value": 900, "priority": "hard", "weight": 10},
        {"type": "nutrient_min", "operator": "min", "value": 180, "target_nutrient_id": prot,
         "priority": "hard", "weight": 10}])
    rep.check("infactible", s == 200 and b["status"] == "infeasible")
    if b.get("status") == "infeasible":
        types = {r["type"] for r in b["unsat_core"]}
        rep.check("nucleo con kcal_target y nutrient_min",
                  "kcal_target" in types and "nutrient_min" in types, f"core={sorted(types)}")

    # -- Casos de diseno con perfiles sinteticos (7-12). Constraints por el cuerpo. --

    print("\nCaso 7. Sintetico 7d/4c, kcal 2000 soft + meal_kcal_ratio. Factible.")
    s, b = _gen(NUTRI, michael, 7, 4, [
        {"type": "kcal_target", "operator": "eq", "value": 2000, "priority": "soft", "weight": 8},
        {"type": "meal_kcal_ratio", "operator": "approx", "priority": "soft", "weight": 5,
         "context": {"split": {"breakfast": 25, "lunch": 35, "dinner": 25, "snack": 15}}}])
    rep.check("factible", s == 200 and b["status"] == "feasible")

    print("\nCaso 8. Sintetico 7d/5c, max_servings red_meat <=2/semana hard. Factible.")
    s, b = _gen(NUTRI, michael, 7, 5, [
        {"type": "max_servings_per_period", "operator": "max", "value": 2,
         "target_tag_id": tids["red_meat"], "priority": "hard", "weight": 5,
         "context": {"window_days": 7}}])
    rep.check("factible", s == 200 and b["status"] == "feasible")
    if b.get("status") == "feasible":
        rep.check("validador en verde", b["validation"]["passed"])

    print("\nCaso 9. Sintetico 7d/3c, no_repeat_food separacion 4 dias soft. Factible.")
    s, b = _gen(NUTRI, michael, 7, 3, [
        {"type": "no_repeat_food", "operator": "forbid", "value": 4, "target_food_id": oat,
         "priority": "soft", "weight": 6, "context": {"granularity": "day"}}])
    rep.check("factible", s == 200 and b["status"] == "feasible")

    print("\nCaso 10. Sintetico 7d/3c, no_repeat_tag pescado separacion 2 dias soft. Factible.")
    s, b = _gen(NUTRI, michael, 7, 3, [
        {"type": "no_repeat_tag", "operator": "forbid", "value": 2,
         "target_tag_id": tids["fish_allergen"], "priority": "soft", "weight": 5,
         "context": {"granularity": "day"}}])
    rep.check("factible", s == 200 and b["status"] == "feasible")

    print("\nCaso 11. Estilo del profesional por ambito nutricionista. Factible reflejando el estilo.")
    await _run_case_11(rep, michael, tids)

    # las fuentes concentradas de calcio del catalogo son lacteos, pescado con
    # espina, soja y frutos secos; al prohibirlas solo quedan aportes bajos
    # (legumbres, verduras, pan) que no alcanzan un minimo alto. el minimo se pone
    # por encima de lo que el pool restante puede dar para forzar la infactibilidad.
    #
    # el umbral se recalibro al ampliar el catalogo (28 -> 58 -> 100 alimentos):
    # con 100, un minimo de 3000 volvio a ser alcanzable (mas legumbres y panes
    # suman), y ademas demostrar la infactibilidad se encarece con el pool (a
    # 3500 la prueba tarda ~13 s en local y en la CPU del hosting no cierra
    # dentro del limite, devolviendo un nucleo vacio). A 6000 la prueba baja a
    # ~2 s en local, con margen para el hardware lento.
    print("\nCaso 12. Sintetico 7d/5c, min calcio alto + prohibir familias con calcio. Infactible.")
    s, b = _gen(NUTRI, michael, 7, 5, [
        {"type": "nutrient_min", "operator": "min", "value": 6000, "target_nutrient_id": calc,
         "priority": "hard", "weight": 10},
        {"type": "forbid_tag", "operator": "forbid", "target_tag_id": tids["milk_allergen"],
         "priority": "hard", "weight": 10},
        {"type": "forbid_tag", "operator": "forbid", "target_tag_id": tids["fish_allergen"],
         "priority": "hard", "weight": 10},
        {"type": "forbid_tag", "operator": "forbid", "target_tag_id": tids["soy"],
         "priority": "hard", "weight": 10},
        {"type": "forbid_tag", "operator": "forbid", "target_tag_id": tids["tree_nuts"],
         "priority": "hard", "weight": 10}])
    rep.check("infactible", s == 200 and b["status"] == "infeasible")
    if b.get("status") == "infeasible":
        types = {r["type"] for r in b["unsat_core"]}
        rep.check("nucleo con el minimo de calcio", "nutrient_min" in types, f"core={sorted(types)}")

    # -- Flujo E2E completo: generar -> persistir -> firmar -> firmado. --
    print("\nFlujo E2E: Emma (constraints del 6b) -> generar -> Draft -> firmar -> Signed.")
    await _run_e2e(rep, emma)

    # -- Propiedad: generar para un cliente ajeno se rechaza. --
    print("\nRechazo de propiedad: generar para un cliente de otro nutri.")
    if other:
        s, b = _gen(NUTRI, other["id"], 3, 3)
        rep.check("403 cliente ajeno", s == 403, f"{s} {b.get('detail','')}")
    else:
        rep.check("403 cliente ajeno", False, "no hay cliente de otro nutri en el seed")

    print(f"\n== {rep.passed} PASS, {rep.failed} FAIL ==")
    return 0 if rep.failed == 0 else 1


async def _run_case_11(rep, client_id, tids):
    """Inserta un estilo de nutri (prefer + max_servings) por ambito nutricionista,
    genera para un cliente sin constraints propias y comprueba que el plan lo
    refleja. Borra la fila temporal al final."""
    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            ids = []
            ids.append(await conn.fetchval(
                """INSERT INTO diet_constraint
                   (scope_type, scope_nutritionist_id, source, type, priority, weight, operator, target_tag_id)
                   VALUES ('nutritionist', $1, 'manual', 'prefer_tag', 'soft', 4, 'prefer', $2) RETURNING id""",
                NUTRI, tids["vegetarian"]))
            ids.append(await conn.fetchval(
                """INSERT INTO diet_constraint
                   (scope_type, scope_nutritionist_id, source, type, priority, weight, operator, target_tag_id, context)
                   VALUES ('nutritionist', $1, 'manual', 'max_servings_per_period', 'hard', 5, 'max', $2, $3) RETURNING id""",
                NUTRI, tids["nova_4"], json.dumps({"window_days": 7, "max": 2})))
    try:
        s, b = _gen(NUTRI, client_id, 7, 5)
        rep.check("factible con estilo de nutri", s == 200 and b["status"] == "feasible")
        if b.get("status") == "feasible":
            rep.check("validador en verde", b["validation"]["passed"])
    finally:
        async with connection_pool() as pool:
            async with pool.acquire() as conn:
                await conn.execute("DELETE FROM diet_constraint WHERE id = ANY($1::int[])", ids)


async def _run_e2e(rep, client_id):
    s, b = _gen(NUTRI, client_id, 7, 5, persist=True)
    ok = s == 200 and b.get("status") == "feasible" and b.get("plan_id")
    rep.check("generado y persistido", bool(ok), f"plan_id={b.get('plan_id')}")
    if not ok:
        return
    plan_id = b["plan_id"]
    rep.check("validador en verde antes de firmar", b["validation"]["passed"])

    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT approved_at FROM plan WHERE id=$1", plan_id)
            nitems = await conn.fetchval(
                "SELECT count(*) FROM plan_meal_item WHERE plan_id=$1 AND food_id IS NOT NULL", plan_id)
    rep.check("persistido como Draft (approved_at NULL)", row and row["approved_at"] is None)
    rep.check("items con food_id", nitems > 0, f"{nitems} items")

    s, b = _call("POST", f"/plans/{plan_id}/sign", {"nutritionist_id": NUTRI})
    rep.check("firma 200 y estado signed", s == 200 and b.get("status") == "signed", f"{s} {b}")

    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT approved_at, signed_by FROM plan WHERE id=$1", plan_id)
            signed = row and row["approved_at"] is not None and row["signed_by"] is not None
            rep.check("plan firmado en BD (Signed)", bool(signed))
            await conn.execute("DELETE FROM plan WHERE id=$1", plan_id)


async def _cid(conn, name):
    return await conn.fetchval(
        "SELECT id FROM client WHERE nutritionist_id=$1 AND full_name_pseudonym=$2", NUTRI, name)


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
