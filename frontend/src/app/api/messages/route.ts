import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { MessageRow } from "@/lib/messages";

export const dynamic = "force-dynamic";

// Polling del hilo abierto. Lee bajo la sesion del nutri (cookies, RLS) los
// mensajes del cliente posteriores a `since` y los devuelve en JSON. De paso
// marca como leidos los del cliente, para que el badge de no leidos baje.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = Number(searchParams.get("with"));
  const since = searchParams.get("since");

  if (!Number.isInteger(clientId) || clientId <= 0) {
    return NextResponse.json({ messages: [] });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ messages: [] }, { status: 401 });
  }

  let query = supabase
    .from("message")
    .select("id, client_id, sender, body, read_at, created_at")
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (since) {
    query = query.gt("created_at", since);
  }

  const { data } = await query;
  const messages = (data as MessageRow[] | null) ?? [];

  // Marca leidos los del cliente. La RLS limita el update a los del nutri.
  await supabase
    .from("message")
    .update({ read_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .eq("sender", "client")
    .is("read_at", null);

  return NextResponse.json({ messages });
}
