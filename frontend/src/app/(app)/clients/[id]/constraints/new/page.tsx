import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireNutritionist } from "@/lib/supabase/session";
import { tagGroup, TAG_GROUP_ORDER } from "@/lib/foods";
import { MACRO_CODES, MEAL_SPLIT_CODES } from "@/lib/constraints";
import { Card } from "@/components/ui/card";
import { ConstraintForm } from "../constraint-form";

type ClientRow = { id: number; full_name_pseudonym: string };
type TagRow = { id: number; name_en: string; kind: string };
type NutrientRow = { id: number; code: string; name_en: string; unit_default: string };
type UnitRow = { id: number; code: string; name_en: string };
type MealTypeRow = { code: string; name_en: string };

export default async function NewConstraintPage({
  params,
}: {
  params: { id: string };
}) {
  const clientId = Number(params.id);
  if (!Number.isInteger(clientId)) notFound();

  const { supabase } = await requireNutritionist();

  const { data: client } = await supabase
    .from("client")
    .select("id, full_name_pseudonym")
    .eq("id", clientId)
    .is("deleted_at", null)
    .single<ClientRow>();

  if (!client) notFound();

  const [{ data: tags }, { data: nutrients }, { data: units }, { data: mealTypes }] =
    await Promise.all([
      supabase.from("tag").select("id, name_en, kind").order("name_en"),
      supabase
        .from("nutrient")
        .select("id, code, name_en, unit_default")
        .order("name_en"),
      supabase.from("unit").select("id, code, name_en").order("name_en"),
      supabase.from("meal_type").select("code, name_en").order("default_order"),
    ]);

  const tagRows = (tags as TagRow[] | null) ?? [];
  const nutrientRows = (nutrients as NutrientRow[] | null) ?? [];
  const unitRows = (units as UnitRow[] | null) ?? [];
  const mealTypeRows = (mealTypes as MealTypeRow[] | null) ?? [];

  const tagGroups = groupTags(tagRows);
  const macroOptions = MACRO_CODES.map((code) =>
    nutrientRows.find((n) => n.code === code)
  ).filter((n): n is NutrientRow => Boolean(n));
  const mealSplit = MEAL_SPLIT_CODES.map((code) => {
    const mt = mealTypeRows.find((m) => m.code === code);
    return { code, label: mt?.name_en ?? code };
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <Link
          href={`/clients/${client.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to {client.full_name_pseudonym}
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Add constraint</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A dietary rule for {client.full_name_pseudonym} that the plan generator
          will respect.
        </p>
      </div>

      <Card>
        <ConstraintForm
          clientId={client.id}
          tagGroups={tagGroups}
          nutrients={nutrientRows}
          macros={macroOptions}
          units={unitRows}
          mealSplit={mealSplit}
        />
      </Card>
    </div>
  );
}

function groupTags(rows: TagRow[]) {
  const byGroup = new Map<string, { id: number; name: string }[]>();
  for (const t of rows) {
    const g = tagGroup(t.kind);
    const list = byGroup.get(g) ?? [];
    list.push({ id: t.id, name: t.name_en });
    byGroup.set(g, list);
  }
  return TAG_GROUP_ORDER.filter((g) => byGroup.has(g)).map((group) => ({
    group,
    options: byGroup.get(group) ?? [],
  }));
}
