import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Buscador de alimentos para el picker del alta de restricciones. Lee bajo la
// sesion del nutri (cookies, RLS), asi que devuelve el catalogo publico mas los
// custom propios. Mismo ilike que /foods sobre name_en/name_es.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ foods: [] }, { status: 401 });
  }

  let query = supabase
    .from("food")
    .select("id, name_en, name_es, nutritionist_id")
    .is("deleted_at", null)
    .order("name_en", { ascending: true })
    .limit(20);
  if (q) {
    query = query.or(`name_en.ilike.%${q}%,name_es.ilike.%${q}%`);
  }

  const { data } = await query;
  return NextResponse.json({ foods: data ?? [] });
}
