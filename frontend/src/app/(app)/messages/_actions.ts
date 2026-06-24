"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SendState = { error: string | null };

export async function sendMessage(
  _prev: SendState,
  formData: FormData
): Promise<SendState> {
  const clientId = Number(formData.get("client_id"));
  const body = String(formData.get("body") ?? "").trim();

  if (!Number.isInteger(clientId) || clientId <= 0) {
    return { error: "No conversation selected." };
  }
  if (!body) {
    return { error: "Write a message first." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // El cliente tiene que ser del nutri (la RLS al leer ya lo filtra).
  const { data: client } = await supabase
    .from("client")
    .select("id")
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!client) {
    return { error: "That client does not exist." };
  }

  // nutritionist_id fijado al usuario y exigido por la policy (doble defensa).
  const { error } = await supabase.from("message").insert({
    nutritionist_id: user.id,
    client_id: clientId,
    sender: "nutritionist",
    body,
  });
  if (error) {
    return { error: "Could not send the message. Please try again." };
  }

  revalidatePath("/messages");
  return { error: null };
}

// Marca como leidos los mensajes del cliente al abrir el hilo.
export async function markThreadRead(clientId: number): Promise<void> {
  if (!Number.isInteger(clientId) || clientId <= 0) return;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("message")
    .update({ read_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .eq("sender", "client")
    .is("read_at", null);
}
