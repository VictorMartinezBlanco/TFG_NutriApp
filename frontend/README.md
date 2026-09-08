# Frontend NutriApp

Aplicación web en Next.js 14 (App Router) que lee la base de datos de Supabase
con la clave pública y la RLS. El backend de Python sigue en `../backend`.

## Qué hace

Un único login para los dos roles de la aplicación. Tras entrar, la raíz reparte:
el nutricionista va a su panel y el cliente al suyo.

### Panel del nutricionista

- Layout con sidebar colapsable y header.
- Dashboard con datos reales de la BD (clientes, planes, borradores sin firmar,
  alimentos del catálogo).
- Clientes (lista + ficha + alta): datos del cliente y sus restricciones bajo
  RLS, con buscador por nombre y alta de restricciones en lenguaje llano.
- Planes (lista + ficha + generación): la lista muestra los planes del nutri con
  su cliente, estado y fechas; la ficha despliega las comidas agrupadas por día
  con sus items y el botón de firma; la generación con IA (`/plans/generate`)
  encola la tarea en el backend y sigue su estado por sondeo.
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

### Panel del cliente

Bajo `/my`:

- Dashboard: saludo, las comidas del día que le toca hoy en su plan, la próxima
  cita y el último mensaje de su hilo.
- My Plan: el plan completo (días, comidas, alimentos con gramos y macros
  diarios medios) con la casilla para marcar cada comida como hecha.
- Peso, citas (solicitud y cancelación) y mensajes con su nutricionista.

El cliente solo ve planes **firmados**: un borrador del profesional no le llega,
y no porque la pantalla lo filtre, sino porque la policy no lo entrega.

Todo se lee con la publishable key, así que la RLS decide qué filas devuelve
según quién esté logueado. Las escrituras del nutricionista (alta de alimento,
citas, mensajes, perfil, disponibilidad) van también con la publishable key: las
policies de INSERT/UPDATE obligan a que `nutritionist_id` sea el del usuario
logueado. El cliente escribe solo en sus propias filas (marcas de comida, peso, citas y
mensajes), con policies de escritura propias.

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
    page.tsx           # raiz: reparte por rol (nutri -> /dashboard, cliente -> /my)
    (auth)/login/      # formulario de login, comun a los dos roles
    (app)/             # shell con sidebar + header, guard de sesion
      layout.tsx
      dashboard/       # pantalla viva con datos reales
      clients/         # lista + ficha [id] + alta de restricciones
      plans/           # lista + ficha [id] + generación con IA (generate)
      foods/           # catalogo + ficha [id] + alta custom (new, server action)
      calendar/        # lista de citas + alta por dialogo (server action)
      messages/        # conversaciones + hilo con sondeo cada 15s
      settings/        # 4 tabs (perfil y disponibilidad editables)
      ui-kit/          # muestra de componentes + lectura de catalogos (RLS)
    (client)/          # mismo shell con el sidebar del cliente
      layout.tsx
      my/dashboard/    # plan de hoy, proxima cita, ultimo mensaje
      my/plan/         # plan firmado completo
    api/
      messages/        # route handler GET para el sondeo de mensajes
scripts/
  check-client-rls.mjs # aislamiento con tres actores reales (ver Notas)
```

El route group `(app)` aplica el shell (sidebar + header) y el guard del
nutricionista; `(client)` hace lo mismo para el cliente bajo el prefijo `/my`.
`(auth)` agrupa el login sin shell. Los grupos no añaden segmento a la URL, así
que las rutas quedan limpias (`/login`, `/dashboard`, `/my/plan`, ...).

El rol se decide por el vínculo `client.auth_user_id`, no por los metadatos de la
cuenta: esos los puede reescribir el propio usuario desde el navegador. Quien
fuerce una URL del otro panel es devuelto al suyo, pero la barrera real de los
datos es la RLS.

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

Sin sesión, cualquier ruta de los dos paneles redirige a `/login`. Tras entrar se
aterriza en la raíz, que reparte según el rol.

Las credenciales de los usuarios de prueba (dos nutricionistas y el cliente de
demostración) están en `.test-user.local.md`, que no se sube al repo. El panel
muestra datos solo si hay clientes y planes; el juego de demostración se siembra
desde `../backend/migrations/sql/0004_seed_demo.sql` y siguientes, y
`0017_seed_demo_refresh.sql` vuelve a acercar sus fechas al día de hoy cuando la
demo se queda atrás. La cuenta del cliente se crea y vincula con
`../backend/scripts/create_demo_client.py`.

## Notas

- La publishable key tiene el formato nuevo `sb_publishable_...`. Funciona con
  `@supabase/supabase-js` y `@supabase/ssr` igual que la antigua anon key.
- La RLS solo deja leer a usuarios autenticados (`TO authenticated`). Sin
  sesión, las queries devuelven cero filas.
- `scripts/check-client-rls.mjs` comprueba el aislamiento entre los dos roles con
  tres sesiones reales (cliente, su nutricionista y otro ajeno) y la clave
  pública. Monta y deshace su propio escenario, así que se puede repetir:

  ```bash
  CLIENT_DEMO_PASSWORD=... NUTRI1_PASSWORD=... NUTRI2_PASSWORD=... \
    node --env-file=.env.local scripts/check-client-rls.mjs
  ```

## Production deployment

La app pública vive en https://nutriapp-tfg.netlify.app (los dos paneles; la parte
de IA corre en el backend de Python desplegado en Render y en el worker local). Es un prototipo
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
