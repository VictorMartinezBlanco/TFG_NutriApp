"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type FoodFormState = { error: string | null };

// Macros que se aceptan en el alta. El primer grupo es obligatorio porque el
// solver los necesita; el segundo es opcional.
const REQUIRED_NUTRIENTS = ["energy_kcal", "protein_g", "carb_g", "fat_g"] as const;
const OPTIONAL_NUTRIENTS = ["fiber_g", "sat_fat_g", "sugar_added_g", "sodium_mg"] as const;

function parseAmount(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
}

export async function createCustomFood(
  _prev: FoodFormState,
  formData: FormData
): Promise<FoodFormState> {
  const nameEn = String(formData.get("name_en") ?? "").trim();
  const nameEs = String(formData.get("name_es") ?? "").trim();

  if (!nameEn) {
    return { error: "English name is required." };
  }

  // Recoge los nutrientes presentes validando que sean numeros >= 0.
  const nutrientValues: { code: string; value: number }[] = [];
  for (const code of [...REQUIRED_NUTRIENTS, ...OPTIONAL_NUTRIENTS]) {
    const value = parseAmount(formData.get(code));
    const required = (REQUIRED_NUTRIENTS as readonly string[]).includes(code);
    if (value == null) {
      if (required) return { error: "Energy, protein, carbs and fat are required." };
      continue;
    }
    if (Number.isNaN(value) || value < 0) {
      return { error: `Invalid value for ${code.replace(/_/g, " ")}.` };
    }
    nutrientValues.push({ code, value });
  }

  const servingRaw = parseAmount(formData.get("typical_serving_g"));
  if (servingRaw != null && (Number.isNaN(servingRaw) || servingRaw <= 0)) {
    return { error: "Typical serving must be a positive number." };
  }

  const tagIds = formData
    .getAll("tags")
    .map((t) => Number(t))
    .filter((n) => Number.isInteger(n));

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Resuelve los nutrient_id por code en una sola consulta.
  const { data: nutrientRows, error: nutrientLookupError } = await supabase
    .from("nutrient")
    .select("id, code")
    .in(
      "code",
      nutrientValues.map((n) => n.code)
    );
  if (nutrientLookupError || !nutrientRows) {
    return { error: "Could not resolve nutrient catalog. Try again." };
  }
  const nutrientIdByCode = new Map<string, number>(
    nutrientRows.map((r) => [r.code as string, r.id as number])
  );

  // 1. Inserta el alimento. nutritionist_id se fija al usuario logueado de forma
  // explicita; la policy p_food_write ademas lo exige en su WITH CHECK.
  const { data: inserted, error: foodError } = await supabase
    .from("food")
    .insert({
      name_en: nameEn,
      name_es: nameEs || nameEn,
      source: "custom",
      typical_serving_g: servingRaw,
      nutritionist_id: user.id,
    })
    .select("id")
    .single();

  if (foodError || !inserted) {
    return { error: "Could not create the food. " + (foodError?.message ?? "") };
  }

  const foodId = inserted.id as number;

  // 2. Inserta los nutrientes. PostgREST no da transaccion multi-tabla, asi que
  // si algo falla aqui se compensa con un soft-delete del alimento recien creado.
  const nutrientPayload = nutrientValues
    .map((n) => ({
      food_id: foodId,
      nutrient_id: nutrientIdByCode.get(n.code),
      value_per_100g: n.value,
    }))
    .filter((row) => row.nutrient_id != null);

  const { error: fnError } = await supabase
    .from("food_nutrient")
    .insert(nutrientPayload);
  if (fnError) {
    await supabase.from("food").update({ deleted_at: new Date().toISOString() }).eq("id", foodId);
    return { error: "Could not save the nutrition data. Please try again." };
  }

  // 3. Inserta las tags si las hay.
  if (tagIds.length > 0) {
    const { error: ftError } = await supabase
      .from("food_tag")
      .insert(tagIds.map((tag_id) => ({ food_id: foodId, tag_id })));
    if (ftError) {
      await supabase.from("food").update({ deleted_at: new Date().toISOString() }).eq("id", foodId);
      return { error: "Could not save the tags. Please try again." };
    }
  }

  revalidatePath("/foods");
  redirect("/foods");
}
