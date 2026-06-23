# Frontend NutriApp

Aplicación web en Next.js 14 (App Router) que lee la base de datos de Supabase
con la clave pública y la RLS. El backend de Python sigue en `../backend`.

## Qué hace por ahora

Login real de un nutricionista y, ya con sesión, el panel del nutri: un layout
con sidebar colapsable y header, y un dashboard con datos reales de la BD
(clientes, planes, borradores sin firmar, alimentos del catálogo). El resto de
secciones del menú (clientes, planes, calendario, mensajes, ajustes) están como
placeholders navegables a la espera de bloques posteriores.

Todo se lee con la publishable key, así que la RLS decide qué filas devuelve
según el nutricionista logueado.

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
      clients/         # placeholder
      plans/           # placeholder
      calendar/        # placeholder
      messages/        # placeholder
      settings/        # placeholder
      ui-kit/          # muestra de componentes + lectura de catalogos (RLS)
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
- El calendario y la mensajería no tienen tabla en el modelo v0, así que sus
  pantallas no muestran datos todavía: quedan como placeholders.
