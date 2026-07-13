// construye y valida la fila de diet_constraint a partir del FormData del alta.
// logica pura, sin cookies ni supabase, para poder validarla aislada. devuelve
// la fila lista para insertar o un mensaje de error legible.

import { constraintMeta, MEAL_SPLIT_CODES } from "./constraints";

export type BuildResult =
  | { row: Record<string, unknown>; error: null }
  | { row: null; error: string };

function parseNumber(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
}

function parseInt1(raw: FormDataEntryValue | null): number | null {
  const n = parseNumber(raw);
  if (n == null) return null;
  return Number.isInteger(n) ? n : NaN;
}

function fail(error: string): BuildResult {
  return { row: null, error };
}

export function buildConstraintRow(formData: FormData): BuildResult {
  const clientId = parseInt1(formData.get("client_id"));
  if (clientId == null || Number.isNaN(clientId) || clientId <= 0) {
    return fail("Invalid client.");
  }

  const type = String(formData.get("type") ?? "").trim();
  const meta = constraintMeta(type);
  if (!meta) return fail("Unknown constraint type.");

  const priorityRaw = String(formData.get("priority") ?? "").trim();
  const priority = meta.priorityLocked ? meta.defaultPriority : priorityRaw;
  if (priority !== "hard" && priority !== "soft") {
    return fail("Priority must be hard or soft.");
  }

  const weight = parseInt1(formData.get("weight"));
  if (weight == null || Number.isNaN(weight) || weight < 1 || weight > 10) {
    return fail("Weight must be a whole number between 1 and 10.");
  }

  const row: Record<string, unknown> = {
    scope_type: "client",
    scope_client_id: clientId,
    type,
    operator: meta.operator,
    priority,
    weight,
    source: "manual",
    context: {},
  };
  const context: Record<string, unknown> = {};

  // targets
  if (meta.target === "tag") {
    const tagId = parseInt1(formData.get("target_tag_id"));
    if (tagId == null || Number.isNaN(tagId)) return fail("Select a tag for this constraint.");
    row.target_tag_id = tagId;
  }
  if (meta.target === "food") {
    const foodId = parseInt1(formData.get("target_food_id"));
    if (foodId == null || Number.isNaN(foodId)) return fail("Select a food for this constraint.");
    row.target_food_id = foodId;
  }
  if (meta.target === "nutrient") {
    const nutrientId = parseInt1(formData.get("target_nutrient_id"));
    if (nutrientId == null || Number.isNaN(nutrientId)) return fail("Select a nutrient for this constraint.");
    row.target_nutrient_id = nutrientId;
  }
  if (meta.target === "macro") {
    const nutrientId = parseInt1(formData.get("target_nutrient_id"));
    if (nutrientId == null || Number.isNaN(nutrientId)) return fail("Select a macronutrient for this constraint.");
    row.target_nutrient_id = nutrientId;
  }
  if (meta.target === "food_or_tag") {
    const termKind = String(formData.get("term_kind") ?? "").trim();
    if (termKind === "food") {
      const foodId = parseInt1(formData.get("target_food_id"));
      if (foodId == null || Number.isNaN(foodId)) return fail("Select a food for this constraint.");
      row.target_food_id = foodId;
    } else if (termKind === "tag") {
      const tagId = parseInt1(formData.get("target_tag_id"));
      if (tagId == null || Number.isNaN(tagId)) return fail("Select a tag for this constraint.");
      row.target_tag_id = tagId;
    } else {
      return fail("Choose whether the item is a food or a tag.");
    }
  }

  // value / unit
  if (meta.needsValue) {
    const value = parseNumber(formData.get("value"));
    if (value == null || Number.isNaN(value)) return fail("This constraint needs a numeric value.");
    if (value < 0) return fail("The value cannot be negative.");
    row.value = value;
  }
  if (meta.needsUnit) {
    const unitId = parseInt1(formData.get("unit_id"));
    if (unitId != null && !Number.isNaN(unitId)) row.unit_id = unitId;
  }

  // ramas de contexto
  if (type === "nutrient_ratio") {
    const denom = parseInt1(formData.get("denominator_nutrient_id"));
    if (denom == null || Number.isNaN(denom)) return fail("Select the denominator nutrient for the ratio.");
    if (denom === row.target_nutrient_id) return fail("Numerator and denominator must be different nutrients.");
    const bound = String(formData.get("ratio_bound") ?? "max").trim();
    row.operator = bound === "min" ? "min" : "max";
    context.denominator_nutrient_id = denom;
  }
  if (type === "max_servings_per_period") {
    const windowDays = parseInt1(formData.get("window_days"));
    if (windowDays == null || Number.isNaN(windowDays) || windowDays < 1) return fail("Enter a window of at least 1 day.");
    context.window_days = windowDays;
  }
  if (type === "no_repeat_food") {
    const gap = row.value as number;
    if (gap < 1) return fail("The minimum gap must be at least 1 day.");
    const granularity = String(formData.get("granularity") ?? "day").trim();
    context.granularity = granularity === "meal" ? "meal" : "day";
  }
  if (type === "forbid_combination") {
    const partnerKind = String(formData.get("partner_kind") ?? "").trim();
    if (partnerKind === "food") {
      const partner = parseInt1(formData.get("partner_food_id"));
      if (partner == null || Number.isNaN(partner)) return fail("Select the second food of the combination.");
      if (partner === row.target_food_id) return fail("The two items must be different.");
      context.combine_with = { food_id: partner };
    } else if (partnerKind === "tag") {
      const partner = parseInt1(formData.get("partner_tag_id"));
      if (partner == null || Number.isNaN(partner)) return fail("Select the second tag of the combination.");
      if (partner === row.target_tag_id) return fail("The two items must be different.");
      context.combine_with = { tag_id: partner };
    } else {
      return fail("Choose whether the second item is a food or a tag.");
    }
  }
  if (type === "prefer_food" || type === "prefer_tag") {
    const mealType = String(formData.get("meal_type") ?? "").trim();
    if (mealType) context.meal_type = mealType;
  }
  if (type === "meal_kcal_ratio") {
    const split: Record<string, number> = {};
    let total = 0;
    for (const code of MEAL_SPLIT_CODES) {
      const pct = parseNumber(formData.get(`split_${code}`));
      if (pct == null) continue;
      if (Number.isNaN(pct) || pct < 0 || pct > 100) return fail("Each meal share must be between 0 and 100.");
      if (pct > 0) {
        split[code] = pct;
        total += pct;
      }
    }
    if (Object.keys(split).length === 0) return fail("Enter a share for at least one meal.");
    if (total > 100) return fail("The meal shares add up to more than 100%.");
    context.split = split;
  }

  row.context = context;
  return { row, error: null };
}
