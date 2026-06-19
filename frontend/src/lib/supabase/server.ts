import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente para Server Components y Server Actions. Lee la sesion de las cookies
// y la propaga a Supabase, de modo que las queries van como el nutri logueado y
// la RLS filtra por su auth.uid(). El setAll puede fallar al llamarse desde un
// Server Component (no se pueden escribir cookies ahi); el middleware ya refresca
// la sesion, asi que ese caso se ignora a proposito.
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // llamado desde un Server Component: lo gestiona el middleware
          }
        },
      },
    },
  );
}
