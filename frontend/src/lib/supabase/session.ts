import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./server";

// Usuario + perfil del nutri logueado. cache() lo deduplica dentro de la misma
// request, asi que el layout y la pagina lo comparten sin consultar dos veces.
// Sin sesion redirige a /login (sirve de guard).
export const requireNutritionist = cache(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("nutritionist")
    .select("full_name")
    .eq("id", user.id)
    .single();

  return {
    supabase,
    user,
    fullName: profile?.full_name ?? user.email ?? "Nutricionista",
  };
});
