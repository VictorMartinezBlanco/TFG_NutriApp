import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { GenerationTask } from "@/lib/generation";

export const dynamic = "force-dynamic";

const TASK_SELECT =
  "id, client_id, kind, status, plan_id, input_text, error, result, created_at, finished_at";

// Ventana en la que un generate fallido sigue siendo visible en la lista.
const FAILED_WINDOW_MS = 24 * 60 * 60 * 1000;

// Polling de la cola bajo la sesion del nutri (cookies, RLS). Dos modos:
//   ?id=<n>     una tarea concreta (para esperar a que traduzca o genere)
//   ?generate=1 las tareas de generacion activas mas las fallidas recientes
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));
  const generate = searchParams.get("generate");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ tasks: [] }, { status: 401 });
  }

  if (Number.isInteger(id) && id > 0) {
    const { data } = await supabase
      .from("generation_task")
      .select(TASK_SELECT)
      .eq("id", id)
      .maybeSingle();
    return NextResponse.json({ task: (data as GenerationTask | null) ?? null });
  }

  if (generate) {
    // Las de generacion sin cerrar, mas las fallidas de las ultimas 24h para
    // que una infactibilidad no desaparezca sin explicarse. RLS limita al nutri.
    const since = new Date(Date.now() - FAILED_WINDOW_MS).toISOString();
    const { data } = await supabase
      .from("generation_task")
      .select(TASK_SELECT)
      .eq("kind", "generate")
      .or(
        `status.in.(queued,in_progress),and(status.eq.failed,finished_at.gt.${since})`
      )
      .order("created_at", { ascending: false });
    return NextResponse.json({ tasks: (data as GenerationTask[] | null) ?? [] });
  }

  return NextResponse.json({ tasks: [] });
}
