// Convierte una fila de diet_constraint en una etiqueta legible para la ficha.
// Solo lectura: cubre los tipos que se usan hoy y deja un fallback razonable.

export type ConstraintRow = {
  id: number;
  type: string;
  operator: string | null;
  value: number | null;
  value2: number | null;
  priority: "hard" | "soft";
  weight: number;
  tag: { name_en: string; kind: string } | null;
  food: { name_en: string } | null;
  nutrient: { name_en: string; unit_default: string } | null;
};

export function constraintLabel(c: ConstraintRow): string {
  const tag = c.tag?.name_en;
  const food = c.food?.name_en;
  const nutrient = c.nutrient?.name_en;
  const unit = c.nutrient?.unit_default ?? "";

  switch (c.type) {
    case "forbid_tag":
      return `Avoid ${tag ?? "tag"}`;
    case "prefer_tag":
      return `Prefer ${tag ?? "tag"}`;
    case "forbid_food":
      return `Avoid ${food ?? "food"}`;
    case "prefer_food":
      return `Prefer ${food ?? "food"}`;
    case "no_repeat_food":
      return `Do not repeat ${food ?? "food"}`;
    case "kcal_target":
      return `Calorie target ${c.value ?? "?"} kcal/day`;
    case "nutrient_min":
      return `At least ${c.value ?? "?"} ${unit} of ${nutrient ?? "nutrient"}`;
    case "nutrient_max":
      return `At most ${c.value ?? "?"} ${unit} of ${nutrient ?? "nutrient"}`;
    case "nutrient_ratio":
      return `${nutrient ?? "nutrient"} ratio target`;
    case "meals_per_day":
      return `${c.value ?? "?"} meals per day`;
    case "plan_duration_days":
      return `Plan duration ${c.value ?? "?"} days`;
    default:
      return c.type.replace(/_/g, " ");
  }
}

// El tag clinico de la restriccion da una pista del origen para agrupar.
export function constraintGroup(c: ConstraintRow): string {
  if (c.tag) {
    switch (c.tag.kind) {
      case "allergen":
        return "Allergens";
      case "intolerance":
        return "Intolerances";
      case "cultural":
        return "Preferences";
      case "clinical_marker":
        return "Clinical";
      default:
        return "Food rules";
    }
  }
  if (c.nutrient || c.type === "kcal_target") return "Targets";
  return "Other";
}
