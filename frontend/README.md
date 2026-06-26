# Frontend NutriApp

Aplicación web en Next.js 14 (App Router) que lee la base de datos de Supabase
con la clave pública y la RLS. El backend de Python sigue en `../backend`.

## Qué hace por ahora

Login real de un nutricionista y, ya con sesión, el panel del nutri completo:

- Layout con sidebar colapsable y header.
- Dashboard con datos reales de la BD (clientes, planes, borradores sin firmar,
  alimentos del catálogo).
- Clientes (lista + ficha): datos del cliente y sus restricciones bajo RLS, en
  solo lectura.
- Planes (lista + ficha): la lista muestra los planes del nutri con su cliente,
  estado y fechas; la ficha despliega las comidas agrupadas por día con sus
  items, también solo lectura.
- Alimentos (catálogo + ficha + alta custom): la lista busca por nombre y filtra
  por alimentos propios, la ficha muestra el perfil nutricional (macros y micros
  desde `food_nutrient`) y las tags, y el alta crea un alimento custom con sus
  nutrientes y tags mediante un Server Action bajo RLS.
- Calendario: citas en lista (próximas y pasadas) y alta de cita desde un
  diálogo, con aviso si la hora cae fuera de la disponibilidad declarada.
- Mensajería: dos columnas (conversaciones + hilo), envío de mensajes y refresco
  por sondeo cada 15 s contra un route handler.
- Ajustes: cuatro pestañas (perfil, disponibilidad, notificaciones, estilo
  clínico); perfil y disponibilidad son editables.

Todo se lee con la publishable key, así que la RLS decide qué filas devuelve
según el nutricionista logueado. Las escrituras (alta de alimento, citas,
mensajes, perfil, disponibilidad) van también con la publishable key: las
policies de INSERT/UPDATE obligan a que `nutritionist_id` sea el del usuario
logueado.

## Estructura

```
src/
  lib/
    supabase/
      client.ts        # cliente para componentes del navegador ("use client")
      server.ts        # cliente para Server Components / Actions (lee cookies)
    utils.ts           # helper cn (clsx + tailwind-merge)
  components/
    ui/                # componentes base (button, card, input, label, badge,
                       #   avatar, select, dialog, toaster)
    layout/            # logo, sidebar colapsable, header, nav-items, placeholder
  middleware.ts        # refresca la sesion en cada request
  app/
    actions.ts         # signIn / signOut (server actions)
    layout.tsx         # root: fuente Inter + Toaster
    page.tsx           # raiz: redirige a /dashboard
    (auth)/login/      # formulario de login
    (app)/             # shell con sidebar + header, guard de sesion
      layout.tsx
      dashboard/       # pantalla viva con datos reales
      clients/         # lista + ficha [id] (solo lectura, datos reales)
      plans/           # lista + ficha [id] (solo lectura, datos reales)
      foods/           # catalogo + ficha [id] + alta custom (new, server action)
      calendar/        # lista de citas + alta por dialogo (server action)
      messages/        # conversaciones + hilo con sondeo cada 15s
      settings/        # 4 tabs (perfil y disponibilidad editables)
      ui-kit/          # muestra de componentes + lectura de catalogos (RLS)
    api/
      messages/        # route handler GET para el sondeo de mensajes
```

El route group `(app)` aplica el shell (sidebar + header) y un guard que manda
a `/login` si no hay sesión. `(auth)` agrupa el login sin shell. Los grupos no
añaden segmento a la URL, así que las rutas quedan limpias (`/login`,
`/dashboard`, ...).

## Componentes y diseño

Componentes base en `components/ui/` construidos sobre Radix + Tailwind +
class-variance-authority, con la paleta del prototipo. Los tokens (colores,
radios, sombra de card, medidas de sidebar/header, fuente Inter) viven en
`tailwind.config.ts` y `src/app/globals.css` como variables. El sidebar es
colapsable estilo Notion: expandido muestra iconos y etiquetas, compacto solo
iconos; el estado se guarda en localStorage.

## Variables de entorno

Copiar `.env.example` a `.env.local` y rellenar:

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clave pública del cliente |

Las dos van con `NEXT_PUBLIC_` porque las usa el navegador. La secret key no
entra aquí: solo la usa el backend de Python. `.env.local` no se sube al repo.

## Arrancar

```bash
npm install
cp .env.example .env.local   # rellenar con los datos del proyecto
npm run dev                  # http://localhost:3000
```

Sin sesión, cualquier ruta del panel redirige a `/login`. Tras entrar con un
nutri real, se aterriza en `/dashboard`.

Las credenciales del nutri de prueba están en `.test-user.local.md` (no se
sube al repo). El dashboard muestra datos solo si el nutri tiene clientes y
planes; para tener algo que ver hay un seed de demostración en
`../backend/migrations/sql/0004_seed_demo.sql` (4 clientes y 3 planes para el
nutri de prueba, reaplicable).

## Notas

- La publishable key tiene el formato nuevo `sb_publishable_...`. Funciona con
  `@supabase/supabase-js` y `@supabase/ssr` igual que la antigua anon key.
- La RLS solo deja leer a usuarios autenticados (`TO authenticated`). Sin
  sesión, las queries devuelven cero filas.

## Production deployment

La app pública vive en https://nutriapp-tfg.netlify.app (panel del nutri, sin la
parte de IA, que correrá aparte en el backend de Python). Es un prototipo
académico: las credenciales del nutri demo se entregan por canal seguro a
tutores y revisores, no van en el repo.

### Netlify

El sitio se despliega desde este repo (rama `main` a producción, los pull
requests generan deploy previews). La configuración vive en `netlify.toml`:

- Base directory `Repo/frontend` (el frontend está en un subdirectorio).
- Build command `npm run build`, Node 20.
- El adaptador `@netlify/plugin-nextjs` resuelve el publish, el middleware (como
  edge function) y los Server Actions.

Variables de entorno en Netlify (las mismas dos del `.env.example`, ambas
públicas):

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clave pública del proyecto |

La secret key NO se configura en Netlify: solo la usa el backend de Python. Se
sacan de Supabase en Project Settings, API.

### Supabase Auth

Para que el login funcione en el dominio público hay que registrarlo en el
dashboard de Supabase, en Authentication, URL Configuration:

- Site URL: `https://nutriapp-tfg.netlify.app`.
- Redirect URLs: `https://nutriapp-tfg.netlify.app/**` (con `http://localhost:3000`
  añadido para desarrollo local).

El login es email y contraseña, así que con eso basta; no hay magic link ni
OAuth que configurar.
