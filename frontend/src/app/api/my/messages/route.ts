import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { MessageRow } from "@/lib/messages";

export const dynamic = "force-dynamic";

// Espejo de /api/messages para el lado del cliente. No lleva parametro de hilo:
// la RLS ya limita lo que devuelve a su propia conversacion, asi que no hay
// ningun id que pudiera apuntar al hilo de otro.
//
// Marca de paso como leido lo que le ha escrito su nutricionista, y lo hace por
// la funcion: el cliente no tiene permiso de UPDATE sobre message, porque eso
// le dejaria reescribir tambien el cuerpo.
export async function GET(request: Request) {
  const since = new URL(request.url).searchParams.get("since");

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
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (since) {
    query = query.gt("created_at", since);
  }

  const { data } = await query;
  const messages = (data as MessageRow[] | null) ?? [];

  await supabase.rpc("client_mark_thread_read");

  return NextResponse.json({ messages });
}
