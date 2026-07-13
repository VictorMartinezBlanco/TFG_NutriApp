// Convierte una fila de diet_constraint en una etiqueta legible y define el
// catalogo de tipos que la ficha del cliente puede crear a mano. La metadata de
// tipos es la fuente unica que comparten el formulario y la validacion de
// servidor: que campos pide cada tipo, su prioridad por defecto y su operador.

export type ConstraintRow = {
  id: number;
  type: string;
  operator: string | null;
  value: number | null;
  value2: number | null;
  priority: "hard" | "soft";
  weight: number;
  context: Record<string, unknown> | null;
  tag: { name_en: string; kind: string } | null;
  food: { name_en: string } | null;
  nutrient: { name_en: string; unit_default: string } | null;
};

export function constraintLabel(c: ConstraintRow): string {
  const tag = c.tag?.name_en;
  const food = c.food?.name_en;
  const nutrient = c.nutrient?.name_en;
  const unit = c.nutrient?.unit_default ?? "";
  const ctx = c.context ?? {};

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
      return `Do not repeat ${food ?? "food"} within ${c.value ?? "?"} days`;
    case "kcal_target":
      return `Calorie target ${c.value ?? "?"} kcal/day`;
    case "macro_target":
      return `Macro target ${c.value ?? "?"} ${unit || "g"} of ${nutrient ?? "macro"}`;
    case "nutrient_min":
      return `At least ${c.value ?? "?"} ${unit} of ${nutrient ?? "nutrient"}`;
    case "nutrient_max":
      return `At most ${c.value ?? "?"} ${unit} of ${nutrient ?? "nutrient"}`;
    case "nutrient_ratio":
      return `${nutrient ?? "nutrient"} ratio ${c.operator === "min" ? "at least" : "at most"} ${c.value ?? "?"}`;
    case "meal_kcal_ratio":
      return `Calorie split across meals`;
    case "max_servings_per_period": {
      const target = food ?? tag ?? "item";
      const days = numContext(ctx, "window_days");
      return `At most ${c.value ?? "?"} servings of ${target}${days ? ` per ${days} days` : ""}`;
    }
    case "forbid_combination": {
      const first = food ?? tag ?? "item";
      return `Do not combine ${first} with another item`;
    }
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
  if (c.nutrient || c.type === "kcal_target" || c.type === "meal_kcal_ratio") {
    return "Targets";
  }
  if (c.food) return "Food rules";
  return "Other";
}

function numContext(ctx: Record<string, unknown>, key: string): number | null {
  const raw = ctx[key];
  return typeof raw === "number" ? raw : null;
}

// ===== Catalogo de tipos para el alta manual =====

// Que argumento estructural pide un tipo. El formulario y la validacion de
// servidor leen esto para saber que campos exigir.
export type ConstraintTarget =
  | "none"
  | "tag"
  | "nutrient"
  | "macro"
  | "food"
  | "food_or_tag";

export type ConstraintTypeMeta = {
  type: string;
  label: string;
  family: string;
  target: ConstraintTarget;
  operator: string; // operator que se persiste
  needsValue: boolean; // exige value numerico
  needsUnit: boolean; // ofrece selector de unidad
  defaultPriority: "hard" | "soft";
  priorityLocked: boolean; // hard/soft fijo (no editable)
  hint: string;
};

// Los 13 tipos optimizables. meals_per_day y plan_duration_days quedan fuera:
// son estructurales y llegan por la llamada al solver, no como fila.
// no_repeat_tag no esta todavia en el enum de la base de datos.
export const CONSTRAINT_TYPES: ConstraintTypeMeta[] = [
  {
    type: "kcal_target",
    label: "Calorie target",
    family: "Energy & macro targets",
    target: "none",
    operator: "eq",
    needsValue: true,
    needsUnit: false,
    defaultPriority: "soft",
    priorityLocked: true,
    hint: "Daily energy goal in kcal.",
  },
  {
    type: "macro_target",
    label: "Macro target",
    family: "Energy & macro targets",
    target: "macro",
    operator: "eq",
    needsValue: true,
    needsUnit: false,
    defaultPriority: "soft",
    priorityLocked: true,
    hint: "Daily grams goal for a macronutrient.",
  },
  {
    type: "nutrient_min",
    label: "Minimum nutrient",
    family: "Nutrient limits",
    target: "nutrient",
    operator: "min",
    needsValue: true,
    needsUnit: true,
    defaultPriority: "soft",
    priorityLocked: false,
    hint: "At least this amount of a nutrient per day.",
  },
  {
    type: "nutrient_max",
    label: "Maximum nutrient",
    family: "Nutrient limits",
    target: "nutrient",
    operator: "max",
    needsValue: true,
    needsUnit: true,
    defaultPriority: "soft",
    priorityLocked: false,
    hint: "No more than this amount of a nutrient per day.",
  },
  {
    type: "nutrient_ratio",
    label: "Nutrient ratio",
    family: "Nutrient limits",
    target: "nutrient",
    operator: "max",
    needsValue: true,
    needsUnit: false,
    defaultPriority: "soft",
    priorityLocked: false,
    hint: "Bound the ratio between two nutrients.",
  },
  {
    type: "forbid_food",
    label: "Forbid food",
    family: "Food & tag rules",
    target: "food",
    operator: "forbid",
    needsValue: false,
    needsUnit: false,
    defaultPriority: "hard",
    priorityLocked: false,
    hint: "This food never appears in the plan.",
  },
  {
    type: "prefer_food",
    label: "Prefer food",
    family: "Food & tag rules",
    target: "food",
    operator: "prefer",
    needsValue: false,
    needsUnit: false,
    defaultPriority: "soft",
    priorityLocked: true,
    hint: "Favor this food when possible.",
  },
  {
    type: "forbid_tag",
    label: "Forbid tag",
    family: "Food & tag rules",
    target: "tag",
    operator: "forbid",
    needsValue: false,
    needsUnit: false,
    defaultPriority: "hard",
    priorityLocked: false,
    hint: "No food from this family. Use it for allergies and intolerances.",
  },
  {
    type: "prefer_tag",
    label: "Prefer tag",
    family: "Food & tag rules",
    target: "tag",
    operator: "prefer",
    needsValue: false,
    needsUnit: false,
    defaultPriority: "soft",
    priorityLocked: true,
    hint: "Favor foods from this family.",
  },
  {
    type: "forbid_combination",
    label: "Forbid combination",
    family: "Food & tag rules",
    target: "food_or_tag",
    operator: "forbid",
    needsValue: false,
    needsUnit: false,
    defaultPriority: "hard",
    priorityLocked: false,
    hint: "Two items that must not share a meal.",
  },
  {
    type: "meal_kcal_ratio",
    label: "Meal calorie split",
    family: "Meal distribution",
    target: "none",
    operator: "approx",
    needsValue: false,
    needsUnit: false,
    defaultPriority: "soft",
    priorityLocked: true,
    hint: "Share of the daily energy per meal.",
  },
  {
    type: "max_servings_per_period",
    label: "Max servings per period",
    family: "Frequency & variety",
    target: "food_or_tag",
    operator: "max",
    needsValue: true,
    needsUnit: false,
    defaultPriority: "soft",
    priorityLocked: false,
    hint: "Cap how often a food or family shows up in a window of days.",
  },
  {
    type: "no_repeat_food",
    label: "No-repeat food",
    family: "Frequency & variety",
    target: "food",
    operator: "min",
    needsValue: true,
    needsUnit: false,
    defaultPriority: "soft",
    priorityLocked: true,
    hint: "Minimum gap in days before the food can repeat.",
  },
];

export const CONSTRAINT_FAMILIES = [
  "Energy & macro targets",
  "Nutrient limits",
  "Food & tag rules",
  "Meal distribution",
  "Frequency & variety",
];

export function constraintMeta(type: string): ConstraintTypeMeta | undefined {
  return CONSTRAINT_TYPES.find((t) => t.type === type);
}

// Los tres macronutrientes que admite macro_target, por code.
export const MACRO_CODES = ["protein_g", "carb_g", "fat_g"] as const;

// Reparto de meal_kcal_ratio: los meal_type sobre los que se pide porcentaje.
export const MEAL_SPLIT_CODES = [
  "breakfast",
  "mid_morning",
  "lunch",
  "snack",
  "dinner",
  "late_snack",
] as const;
