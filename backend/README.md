# Backend NutriApp

Base de datos y (más adelante) el backend de Python con el solver y el traductor LLM.

## Base de datos

Postgres gestionado en Supabase (región de Frankfurt). El esquema y los datos
iniciales están en `migrations/sql/`:

- `0001_initial.sql`: las 16 tablas, tipos enum, índices, CHECKs y políticas RLS.
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
  seed_foods.py     # subset de 22 alimentos con nutrientes T1 y tags
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

## Frontend

La conexión desde Next.js con la SDK de Supabase está en `../frontend` (login
real de un nutri y lectura de catálogos + alimentos bajo RLS, todo con la
publishable key). Ver su README.

## Siguiente

- Añadir fastapi, ortools y anthropic a `requirements.txt` cuando arranque el
  pipeline (traductor LLM + solver CP-SAT).
- Carga masiva BEDCA + USDA en una migration aparte (`source_id` +
  `external_food_mapping`).
