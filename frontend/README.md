# Frontend NutriApp

Aplicación web en Next.js 14 (App Router) que lee la base de datos de Supabase
con la clave pública y la RLS. El backend de Python sigue en `../backend`.

## Qué hace por ahora

Una pantalla de login y una pantalla principal que, ya con sesión, lista los
catálogos (nutrientes, tags, tipos de comida, unidades) y los alimentos del
catálogo global. Todo se lee con la publishable key, así que la RLS decide qué
filas devuelve según el nutricionista logueado.

## Estructura

```
src/
  lib/supabase/
    client.ts        # cliente para componentes del navegador ("use client")
    server.ts        # cliente para Server Components / Actions (lee cookies)
  middleware.ts      # refresca la sesion en cada request
  app/
    actions.ts       # signIn / signOut (server actions)
    login/page.tsx   # formulario de login
    page.tsx         # raiz: si hay sesion, lista catalogos + alimentos
```

El patrón de los dos clientes y el middleware es el que recomienda
`@supabase/ssr` para App Router: la sesión vive en cookies, el middleware la
refresca, y tanto el navegador como el servidor leen como el nutri logueado.

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

Sin sesión, la raíz redirige a `/login`. Tras entrar con un nutri real, la
pantalla principal muestra 12 nutrientes, 20 tags, 6 tipos de comida, 7
unidades y los alimentos globales cargados.

Las credenciales del nutri de prueba están en `.test-user.local.md` (no se
sube al repo, como las claves). Si no existe, crear un usuario desde Supabase
Auth: el trigger se encarga de darle de alta en `nutritionist`.

## Notas

- La publishable key tiene el formato nuevo `sb_publishable_...`. Funciona con
  `@supabase/supabase-js` y `@supabase/ssr` igual que la antigua anon key.
- La RLS solo deja leer a usuarios autenticados (`TO authenticated`). Sin
  sesión, las queries devuelven cero filas, por eso la raíz exige login.
- Los catálogos son lectura para cualquier nutri logueado; los alimentos del
  catálogo global son los que tienen `nutritionist_id` a null.
