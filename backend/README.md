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

Para la conexión hay dos puertos: el directo (5432) sirve para desarrollo y
migraciones; para el backend en marcha conviene el pooler (6543), que se copia
desde Supabase → Connect → Transaction pooler.

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

## Siguiente

- Conexión desde Python (asyncpg) y carga de un primer conjunto de alimentos.
- Conexión desde Next.js con la SDK de Supabase y comprobar la RLS con un login real.
