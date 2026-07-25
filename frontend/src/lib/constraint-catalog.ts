// Carga los catalogos que el formulario de restricciones necesita (tags
// agrupados, nutrientes, macros, unidades, reparto de comidas). Lo comparten el
// alta de ambito cliente y la de estilo del nutri para no repetir la consulta.

import { tagGroup, TAG_GROUP_ORDER } from "./foods";
import { MACRO_CODES, MEAL_SPLIT_CODES } from "./constraints";
import type { createClient } from "./supabase/server";

type SupabaseLike = ReturnType<typeof createClient>;

type TagRow = { id: number; name_en: string; kind: string };
type NutrientRow = { id: number; code: string; name_en: string; unit_default: string };
type UnitRow = { id: number; code: string; name_en: string };
type MealTypeRow = { code: string; name_en: string };

export async function loadConstraintCatalog(supabase: SupabaseLike) {
  const [{ data: tags }, { data: nutrients }, { data: units }, { data: mealTypes }] =
    await Promise.all([
      supabase.from("tag").select("id, name_en, kind").order("name_en"),
      supabase.from("nutrient").select("id, code, name_en, unit_default").order("name_en"),
      supabase.from("unit").select("id, code, name_en").order("name_en"),
      supabase.from("meal_type").select("code, name_en").order("default_order"),
    ]);

  const tagRows = (tags as TagRow[] | null) ?? [];
  const nutrientRows = (nutrients as NutrientRow[] | null) ?? [];
  const unitRows = (units as UnitRow[] | null) ?? [];
  const mealTypeRows = (mealTypes as MealTypeRow[] | null) ?? [];

  const tagGroups = groupTags(tagRows);
  const macros = MACRO_CODES.map((code) =>
    nutrientRows.find((n) => n.code === code)
  ).filter((n): n is NutrientRow => Boolean(n));
  const mealSplit = MEAL_SPLIT_CODES.map((code) => {
    const mt = mealTypeRows.find((m) => m.code === code);
    return { code, label: mt?.name_en ?? code };
  });

  return {
    tagGroups,
    nutrients: nutrientRows,
    macros,
    units: unitRows,
    mealSplit,
  };
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
