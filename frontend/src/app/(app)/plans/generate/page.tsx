import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireNutritionist } from "@/lib/supabase/session";
import type { NameMaps } from "@/lib/generation";
import { RequestForm } from "./request-form";
import { ReviewFlow } from "./review-flow";

export const dynamic = "force-dynamic";

type ClientRow = { id: number; full_name_pseudonym: string };

export default async function GeneratePage({
  searchParams,
}: {
  searchParams: { task?: string; client?: string; days?: string; meals?: string };
}) {
  const preselectedClient = Number(searchParams.client) || null;
  const { supabase } = await requireNutritionist();

  const taskId = Number(searchParams.task);
  const inReview = Number.isInteger(taskId) && taskId > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link
          href="/plans"
          className="flex size-8 items-center justify-center rounded-control border border-border text-muted-foreground hover:bg-muted/40"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Generate plan with AI</h1>
          <p className="text-sm text-muted-foreground">
            Describe the client in your own words. The copilot proposes the
            constraints, you decide, and the plan is built in the background.
          </p>
        </div>
      </div>

      {inReview ? (
        <ReviewFlow
          taskId={taskId}
          clientId={Number(searchParams.client) || 0}
          durationDays={Number(searchParams.days) || 7}
          mealsPerDay={Number(searchParams.meals) || 5}
          names={await loadNames(supabase)}
        />
      ) : (
        <RequestForm
          clients={await loadClients(supabase)}
          defaultClientId={preselectedClient}
        />
      )}
    </div>
  );
}

async function loadClients(
  supabase: Awaited<ReturnType<typeof requireNutritionist>>["supabase"]
): Promise<ClientRow[]> {
  const { data } = await supabase
    .from("client")
    .select("id, full_name_pseudonym")
    .is("deleted_at", null)
    .order("full_name_pseudonym");
  return (data as ClientRow[] | null) ?? [];
}

// Diccionarios id -> nombre para etiquetar las constraints propuestas en el
// modal. Se cargan enteros (son catalogos pequenos) bajo RLS.
async function loadNames(
  supabase: Awaited<ReturnType<typeof requireNutritionist>>["supabase"]
): Promise<NameMaps> {
  const [nutrients, tags, foods] = await Promise.all([
    supabase.from("nutrient").select("id, name_en"),
    supabase.from("tag").select("id, name_en"),
    supabase.from("food").select("id, name_en").is("deleted_at", null),
  ]);

  const toMap = (
    rows: { id: number; name_en: string }[] | null
  ): Record<number, string> =>
    Object.fromEntries((rows ?? []).map((r) => [r.id, r.name_en]));

  return {
    nutrients: toMap(nutrients.data as { id: number; name_en: string }[] | null),
    tags: toMap(tags.data as { id: number; name_en: string }[] | null),
    foods: toMap(foods.data as { id: number; name_en: string }[] | null),
  };
}
