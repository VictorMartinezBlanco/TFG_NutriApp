# Backend NutriApp

Base de datos y backend de Python: el solver CP-SAT, el validador, el traductor
LLM con sus comprobaciones previas, el worker de generación y la API HTTP que
los expone.

## Base de datos

Postgres gestionado en Supabase (región de Frankfurt). El esquema y los datos
iniciales están en `migrations/sql/`:

- `0001_initial.sql`: las 16 tablas iniciales (las migraciones posteriores llegan a 22), tipos enum, índices, CHECKs y políticas RLS.
- `0002_seed.sql`: catálogos iniciales (12 nutrientes, 20 tags, 6 tipos de
  comida, 7 unidades).
- `0003_auth_trigger.sql`: crea la fila `nutritionist` al registrarse un usuario.

El diagrama del modelo está en `migrations/ER-modelo-v0.md`.

### Aplicar el esquema

La forma rápida es pegar cada `.sql` en el SQL Editor de Supabase y darle a Run,
en orden (0001, 0002, 0003).

También se puede usar Alembic, que ejecuta esos mismos `.sql`:

```bash
python -m venv .venv
source .venv/Scripts/activate      # en Windows con Git Bash
pip install -r requirements.txt
cp .env.example .env.local          # rellenar con los datos del proyecto
alembic upgrade head
```

Si el esquema ya está aplicado a mano, alinear Alembic sin reejecutar el DDL:

```bash
alembic stamp head
```

### Variables de entorno

Copiar `.env.example` a `.env.local` y rellenar. `.env.local` no se sube al repo.

| Variable | Para qué |
|---|---|
| `SUPABASE_URL` | URL del proyecto |
| `SUPABASE_ANON_KEY` | clave pública (cliente) |
| `SUPABASE_SERVICE_ROLE_KEY` | clave de servidor, se salta la RLS |
| `DATABASE_URL` | cadena de conexión para asyncpg |

Para la conexión hay dos puertos: el directo (5432) y el pooler (6543). El
backend de Python usa el **pooler**, en `DATABASE_URL_POOLER`. El host directo
`db.<ref>.supabase.co` solo resuelve por IPv6 en proyectos free nuevos, así que
desde una red sin IPv6 falla con `getaddrinfo failed`; el pooler va por IPv4 y
lo evita. Se copia desde Supabase → Connect → Transaction pooler. El usuario
tiene la forma `postgres.<project_ref>` y el host es
`aws-1-eu-central-1.pooler.supabase.com`.

## Notas del modelo

- `nutritionist.id` es el id del usuario de Supabase Auth (relación 1:1). Por eso
  el trigger de `0003` crea la fila al darse de alta.
- La RLS filtra por `auth.uid()`: cada nutri ve solo sus datos. Los catálogos son
  de lectura para cualquier usuario logueado. El backend usa la service key, que
  se salta la RLS.
- Soft-delete con `deleted_at` en food, recipe, plan, diet_constraint y client;
  hay que filtrar `WHERE deleted_at IS NULL` en las consultas.
- La tabla de restricciones se llama `diet_constraint` (no `constraint`, que es
  palabra reservada).

## Conexión desde Python

La capa de aplicación vive en `app/` y los scripts en `scripts/`:

```
app/
  config.py         # carga .env.local y elige la mejor cadena (pooler primero)
  db.py             # pool asyncpg (singleton perezoso + context manager)
  repositories.py   # lectura/escritura: catálogos, alta de food, lectura cruzada
  seed_foods.py     # catálogo global de 100 alimentos con nutrientes T1 y tags
scripts/
  check_connection.py
  load_foods.py
```

Con el venv activo y `DATABASE_URL_POOLER` relleno:

```bash
python -m scripts.check_connection   # conecta y cuenta catálogos (espera 12/20/6/7)
python -m scripts.load_foods         # carga el subset de alimentos (idempotente)
```

En modo transaction el pool va con `statement_cache_size=0`: los prepared
statements no sobreviven al reparto de conexiones del pooler. La conexión usa el
rol `postgres` (superusuario), que se salta la RLS, igual que la service key.

El script de carga es re-ejecutable: reutiliza el alimento por nombre y fuente,
hace upsert de los nutrientes y no duplica tags. Toda la carga va en una sola
transacción.

## API HTTP

`app/api/` expone el pipeline determinista por HTTP con FastAPI. Envuelve las
funciones puras `generate_plan` (solver) y `validate_plan` (validador) sin
reimplementar nada.

```
app/api/
  main.py         # app FastAPI, lifespan del pool, auth por token, endpoints
  schemas.py      # modelos Pydantic del contrato de peticion y respuesta
  service.py      # orquesta cargar datos + solver + validador, mapea errores a HTTP
  serialize.py    # dataclasses -> JSON, unifica hallazgos con campo source
  persistence.py  # inserta el plan + items en una transaccion, firma
```

Endpoints:

- `GET /health`: vivo y con la BD accesible (hace un `SELECT 1`).
- `POST /plans/generate`: genera y valida un plan para un cliente. Devuelve 200
  tanto si es factible (plan + metrics + validation + findings) como si es
  infactible (unsat_core + suggestion). Si `persist` es true, escribe el borrador
  y devuelve su `plan_id`. Códigos: 400 entidad inexistente, 403 cliente ajeno,
  422 restricción incoherente.
- `POST /plans/{id}/sign`: marca el plan como firmado (`approved_at` + `signed_by`).

Las llamadas van autenticadas con un token compartido en la cabecera
`Authorization: Bearer <NUTRIAPP_API_TOKEN>`. El backend usa el rol de confianza,
así que además comprueba a mano que el cliente pertenece al nutricionista que
dice la petición. Los borradores se persisten con una transacción real de
asyncpg: el plan y sus items entran juntos o no entra ninguno.

Levantar en local:

```bash
uvicorn app.api.main:app --reload --port 8000
```

## Despliegue

La API se despliega en Render (región de Frankfurt, junto a la BD) con el
`Dockerfile` y el `render.yaml` de esta carpeta. Root directory `backend`. Los
secretos (`DATABASE_URL_POOLER`, `NUTRIAPP_API_TOKEN`) se ponen en la UI de
Render, nunca en el repo. Se verifica que el pooler IPv4 responde desde el
datacenter de Render (el host directo solo resuelve por IPv6).

El plan gratis duerme el servicio tras unos minutos de inactividad, así que el
primer request tras un rato tarda unos segundos en despertar.

## Juego de datos de demostración

La aplicación se demuestra con datos ficticios: doce clientes con seudónimo
repartidos entre dos nutricionistas, sus restricciones, sus planes, sus citas y
sus series de seguimiento. Los nombres son seudónimos a propósito (la columna se
llama `full_name_pseudonym`).

Los planes **no están escritos a mano**: los genera el pipeline real, así que
cada uno respeta de verdad las restricciones de su cliente.

Orden de carga, una sola vez:

```bash
python -m scripts.load_foods                     # catálogo de 100 alimentos
# aplicar migrations/sql/0015_seed_demo_clients.sql y 0016_seed_clinical_style.sql
python -m scripts.seed_demo_plans                # genera y firma los planes
```

Antes de cada demostración o prueba con un usuario hay que reanclar todo lo que
lleva fecha, porque se sembró relativo al día de la carga y caduca. Son dos
ficheros SQL **en este orden**:

```
migrations/sql/0017_seed_demo_refresh.sql
migrations/sql/0019_seed_demo_activity.sql
```

El 0017 mueve al pasado los planes viejos y deja la base de lo fechado. El 0019
va encima y es el que pone la actividad al día: afina la fecha de inicio del plan
vigente de cada cliente, reescribe las citas con tres semanas de horizonte y solo
en días laborables, refresca los hilos de mensajes, amplía las series de peso a
nueve clientes, regenera las comidas marcadas y siembra un historial de tareas de
generación ya cerradas.

Los dos son idempotentes y re-ejecutables: todas las fechas salen de
`CURRENT_DATE` y `now()`, y cada sección borra antes lo que ella misma crea.
Lanzarlos dos veces seguidas deja los mismos conteos.

Los planes duran siete días, así que el margen antes de que el primero caduque es
de un día y el del más fresco de cinco. Conviene volver a lanzarlos **una vez por
semana** mientras la aplicación esté a la vista de alguien, y también la víspera
de una demostración. De paso, cada ejecución escribe en la base y con eso evita
que el proyecto de Supabase se pause por siete días sin actividad.

`0013_seed_demo_refresh.sql` se queda por historia: cubría solo cuatro clientes y
lo sucedió el 0017, así que ya no hace falta aplicarlo.

Las dos cuentas de acceso de cliente se dan de alta con
`scripts/create_demo_client.py`, que elige a quién vincular con
`DEMO_CLIENT_NAME` y `DEMO_CLIENT_EMAIL`. Las contraseñas viven en
`../frontend/.test-user.local.md`, que no se sube al repo.

## Frontend

La conexión desde Next.js con la SDK de Supabase está en `../frontend` (login
real de un nutri, lectura bajo RLS y la llamada server-side a esta API para
generar planes). Ver su README.

