import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./server";

export type AppRole = "nutritionist" | "client" | "unlinked";

export type ClientProfile = {
  id: number;
  fullName: string;
  nutritionistId: string;
};

// Rol del usuario logueado. Lo decide el vinculo en la tabla client, NO los
// metadatos de la cuenta: esos los puede reescribir el propio usuario desde el
// navegador, asi que no sirven para autorizar. Los metadatos solo los usa el
// trigger de alta, donde todavia no existe el vinculo.
// cache() lo deduplica dentro de la misma request, asi que layout y pagina lo
// comparten sin repetir consultas. Sin sesion redirige a /login.
export const resolveSession = cache(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: clientRow } = await supabase
    .from("client")
    .select("id, full_name_pseudonym, nutritionist_id")
    .eq("auth_user_id", user.id)
    .maybeSingle<{
      id: number;
      full_name_pseudonym: string;
      nutritionist_id: string;
    }>();

  if (clientRow) {
    const client: ClientProfile = {
      id: clientRow.id,
      fullName: clientRow.full_name_pseudonym,
      nutritionistId: clientRow.nutritionist_id,
    };
    return { supabase, user, role: "client" as AppRole, client, fullName: client.fullName };
  }

  const { data: profile } = await supabase
    .from("nutritionist")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle<{ full_name: string }>();

  if (profile) {
    return {
      supabase,
      user,
      role: "nutritionist" as AppRole,
      client: null,
      fullName: profile.full_name,
    };
  }

  // Cuenta sin fila en ninguno de los dos lados. No se redirige a /login, que
  // devolveria aqui en bucle: la raiz lo explica y ofrece cerrar sesion.
  return {
    supabase,
    user,
    role: "unlinked" as AppRole,
    client: null,
    fullName: user.email ?? "",
  };
});

// Guard del panel del profesional. Un cliente que fuerce una de sus URLs acaba
// en su propio panel; la barrera real de los datos es la RLS, esto solo evita
// pantallas vacias.
export const requireNutritionist = cache(async () => {
  const session = await resolveSession();
  if (session.role === "client") redirect("/my/dashboard");
  if (session.role === "unlinked") redirect("/");

  return {
    supabase: session.supabase,
    user: session.user,
    fullName: session.fullName || session.user.email || "Nutricionista",
  };
});

// Guard del panel del cliente, espejo del anterior.
export const requireClient = cache(async () => {
  const session = await resolveSession();
  if (session.role === "nutritionist") redirect("/dashboard");
  if (session.role !== "client" || !session.client) redirect("/");

  return {
    supabase: session.supabase,
    user: session.user,
    client: session.client,
  };
});
