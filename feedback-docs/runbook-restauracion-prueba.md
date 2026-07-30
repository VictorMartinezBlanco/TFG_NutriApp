# Runbook: la prueba con nutricionistas, antes y despues

Deja la base de datos de demostracion como estaba antes de la prueba, con las
fechas reancladas a hoy. Sirve igual antes de una demo o de la defensa. Probado
una vez de punta a punta al preparar la prueba (bloque 8.5-prep).

Todo se ejecuta desde `Repo/backend` con el venv activo (`.venv`).

## 0. Antes de abrir la ventana de prueba

1. Pasos 2 y 3 de abajo (planes al dia + fechas reancladas), para que la app
   luzca "hoy" cuando entren.
2. Borrar las marcas de HOY de Lucia. El 0017 deja su dia completo y la tarea 7
   de la guia pide marcar comidas: sin esto el tester no tiene nada que marcar.

```sql
DELETE FROM meal_check mc USING plan p, client c
WHERE mc.plan_id = p.id AND p.client_id = c.id
  AND c.full_name_pseudonym = 'Lucia Fernandez'
  AND p.start_date + (mc.day_num - 1) = CURRENT_DATE;
```

3. Arrancar el worker CON lazo de reinicio, no a pelo. En la preparacion del
   bloque se observo un modo de caida nuevo, distinto del que arreglo el 7g:
   el pooler corta la conexion ociosa y asyncpg revienta al SOLTARLA
   (`PoolConnectionHolder.release() called on a free connection holder`),
   fuera del try/except del bucle. Micro-fix pendiente; mientras tanto el lazo
   lo cubre (desde `Repo/backend`, PowerShell):

```powershell
$env:PYTHONUNBUFFERED = "1"
while ($true) { .\.venv\Scripts\python.exe -m app.worker.run; Start-Sleep -Seconds 5 }
```

4. Al cerrar la ventana del dia, parar el lazo (Ctrl+C dos veces).

## 1. Revisar lo que dejaron los testers

La guia les pide crear encima (clientes con inicial delante, tipo "J. Prueba
Garcia") y no tocar lo existente, pero conviene comprobarlo antes de restaurar.
Consultas orientativas (con un script asyncpg temporal o desde el editor SQL de
Supabase):

```sql
-- entidades creadas durante la ventana de prueba
SELECT id, full_name_pseudonym, created_at FROM client
  WHERE created_at > '<inicio de la ventana>' AND deleted_at IS NULL;
SELECT id, client_id, type, created_at FROM diet_constraint
  WHERE created_at > '<inicio de la ventana>' AND deleted_at IS NULL;
SELECT id, client_id, approved_at, created_at FROM plan
  WHERE created_at > '<inicio de la ventana>' AND deleted_at IS NULL;
SELECT id, name_en, created_at FROM food
  WHERE created_at > '<inicio de la ventana>' AND deleted_at IS NULL;
```

Decision consciente, no automatica: lo creado por los testers es tambien
material de la prueba (dice como usaron la app). Se conserva o se borra
(soft-delete) segun lo que se quiera para la siguiente demo.

Dos comprobaciones que SI son obligatorias, porque los bancos dependen de ellas:

- Los clientes ancla del banco E2E (Maria Gonzalez, John Smith, Emma Wilson,
  Michael Chen) deben conservar sus constraints del seed tal cual; en
  particular los casos sinteticos exigen un cliente SIN constraints propias.
  Si un tester les anadio algo, borrarlo.
- `generation_task` acumula las tareas de la prueba; no rompen nada, pero la
  pantalla de generar las lista (las failed, 24 h). Se limpian si molestan.

## 2. Reponer los planes de la demostracion

```
python -m scripts.seed_demo_plans --dry-run
python -m scripts.seed_demo_plans
```

Idempotente por objetivo: solo genera lo que falte (por ejemplo si alguien
desfirmo o borro un plan sembrado). Con todo al dia no toca nada. Va ANTES del
refresh porque los planes nacen con fecha de hoy y el 0017 es quien reparte los
start_date.

## 3. Reanclar las fechas (el refresh en un comando)

Aplicar `migrations/sql/0017_seed_demo_refresh.sql` (idempotente,
re-ejecutable). Con un script temporal tipo `_apply_0017.py` (el patron
`*_apply.*` esta gitignored):

```python
import asyncio
from pathlib import Path
from app.db import connection_pool

async def main():
    sql = Path("migrations/sql/0017_seed_demo_refresh.sql").read_text(encoding="utf-8")
    async with connection_pool() as pool:
        async with pool.acquire() as conn:
            await conn.execute(sql)
    print("0017 aplicado")

asyncio.run(main())
```

Mueve start_date de los planes, reescribe citas y mensajes, y regenera pesos y
marcas. Los seeds de entidades (0015/0016) no llevan fechas y no hace falta
reaplicarlos salvo que se haya borrado algo estructural.

## 4. Verificar

Runners permanentes del frontend (desde `Repo/frontend`, contra la app servida
en local con `npm run build && npx next start -p 3100`):

```
node scripts/check-client-rls.mjs    # 106/106
node scripts/check-client-e2e.mjs    # 39/39
```

Las contrasenas van por variables de entorno (ver la cabecera de cada runner);
estan en `frontend/.test-user.local.md`.

Y un vistazo manual: dashboard del nutri con datos de hoy, panel de Lucia con
su plan cubriendo el dia, mensajes con no leidos.

Para verificar tambien el servicio de Render: `scripts/check_e2e.py` con
`NUTRIAPP_API_URL=https://tfg-nutriapp.onrender.com` y el token de la API
(29 casos; los pesados oscilan en el free tier, el veredicto fiable es repetir,
no una pasada suelta).
