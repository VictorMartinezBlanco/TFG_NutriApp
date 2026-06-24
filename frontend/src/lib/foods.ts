// Helpers para las pantallas de alimentos. La tabla food no guarda macros
// planos: todo lo nutricional vive en food_nutrient (por 100 g, join a nutrient
// por code). Aqui se pivota y se etiqueta para la UI.

export type NutrientRef = {
  code: string;
  name_en: string;
  unit_default: string;
  kind: string;
};

export type FoodNutrientRow = {
  value_per_100g: number;
  nutrient: NutrientRef | null;
};

export type FoodTagRow = {
  tag: { code: string; name_en: string; kind: string } | null;
};

export type FoodRow = {
  id: number;
  name_es: string;
  name_en: string;
  typical_serving_g: number | null;
  nutritionist_id: string | null;
  created_at: string;
  food_nutrient: FoodNutrientRow[];
};

export type FoodDetail = FoodRow & {
  food_tag: FoodTagRow[];
};

// Los cuatro macros principales que se muestran en la lista y destacados en la
// ficha, en el orden de presentacion.
export const CORE_MACRO_CODES = ["energy_kcal", "protein_g", "carb_g", "fat_g"] as const;

// Macros secundarios que se enseñan en la ficha si el alimento los tiene.
export const EXTRA_MACRO_CODES = ["fiber_g", "sat_fat_g", "sugar_added_g", "sodium_mg"] as const;

export function isCustom(food: { nutritionist_id: string | null }): boolean {
  return food.nutritionist_id !== null;
}

// Indexa los nutrientes de un alimento por code para acceso directo.
export function nutrientMap(rows: FoodNutrientRow[]): Map<string, FoodNutrientRow> {
  const map = new Map<string, FoodNutrientRow>();
  for (const row of rows) {
    if (row.nutrient?.code) map.set(row.nutrient.code, row);
  }
  return map;
}

// Devuelve el valor por 100 g de un nutriente por code, o null si no consta.
export function valueByCode(rows: FoodNutrientRow[], code: string): number | null {
  const found = rows.find((r) => r.nutrient?.code === code);
  return found ? found.value_per_100g : null;
}

// Formatea un numero quitando decimales innecesarios (110.0 -> 110, 1.9 -> 1.9).
export function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export function formatNutrient(value: number, unit: string): string {
  return `${formatAmount(value)} ${unit}`;
}

const TAG_GROUP_LABEL: Record<string, string> = {
  allergen: "Allergens",
  intolerance: "Intolerances",
  cultural: "Preferences",
  clinical_marker: "Clinical markers",
};

// Reutiliza la categorizacion de tag.kind usada en las constraints del cliente.
export function tagGroup(kind: string): string {
  return TAG_GROUP_LABEL[kind] ?? "Other";
}

// Orden de los grupos de tags en la ficha.
export const TAG_GROUP_ORDER = [
  "Allergens",
  "Intolerances",
  "Preferences",
  "Clinical markers",
  "Other",
];
