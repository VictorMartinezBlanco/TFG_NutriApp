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

// Forma normalizada de una restriccion para escribir su frase legible. Tanto una
// fila de diet_constraint (con sus embeds de nombre) como una constraint cruda del
// worker (targets por id, nombres resueltos aparte) se reducen a esto, para que
// haya una unica fuente de lenguaje llano en toda la interfaz.
export type ConstraintParts = {
  type: string;
  operator?: string | null;
  value?: number | null;
  tag?: string;
  food?: string;
  nutrient?: string;
  unit?: string;
  windowDays?: number | null;
};

// Frase en lenguaje natural, sin vocabulario tecnico. El nutri lee "Never eat
// red meat", no "forbid_tag red_meat hard".
export function constraintSentence(p: ConstraintParts): string {
  const tag = p.tag ?? "this family";
  const food = p.food ?? "this food";
  const nutrient = p.nutrient ?? "this nutrient";
  const unit = p.unit ? ` ${p.unit}` : "";
  const amount = p.value ?? "?";

  switch (p.type) {
    case "forbid_tag":
      return `Never include ${tag}`;
    case "prefer_tag":
      return `Favor ${tag} when possible`;
    case "forbid_food":
      return `Never include ${food}`;
    case "prefer_food":
      return `Favor ${food} when possible`;
    case "no_repeat_food":
      return `Do not repeat ${food} within ${amount} days`;
    case "kcal_target":
      return `Aim for about ${amount} kcal a day`;
    case "macro_target":
      return `Aim for about ${amount} g of ${nutrient} a day`;
    case "nutrient_min":
      return `At least ${amount}${unit} of ${nutrient} a day`;
    case "nutrient_max":
      return `No more than ${amount}${unit} of ${nutrient} a day`;
    case "nutrient_ratio":
      return `Keep ${nutrient} ${p.operator === "min" ? "above" : "below"} a ${amount} ratio`;
    case "meal_kcal_ratio":
      return "Split the daily calories across meals";
    case "max_servings_per_period": {
      const target = p.food ?? p.tag ?? "this item";
      return `At most ${amount} servings of ${target}${p.windowDays ? ` every ${p.windowDays} days` : ""}`;
    }
    case "forbid_combination": {
      const first = p.food ?? p.tag ?? "this item";
      return `Never serve ${first} together with another item`;
    }
    case "no_repeat_tag":
      return `Do not repeat ${tag} within ${amount} days`;
    default:
      return p.type.replace(/_/g, " ");
  }
}

export function constraintLabel(c: ConstraintRow): string {
  return constraintSentence({
    type: c.type,
    operator: c.operator,
    value: c.value,
    tag: c.tag?.name_en,
    food: c.food?.name_en,
    nutrient: c.nutrient?.name_en,
    unit: c.nutrient?.unit_default ?? "",
    windowDays: numContext(c.context ?? {}, "window_days"),
  });
}

// "Must" para una regla dura, "Prefer" para una preferencia. Sin exponer el
// enum hard/soft al nutri.
export function priorityLabel(p: "hard" | "soft"): string {
  return p === "hard" ? "Must" : "Prefer";
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
    priorityLocked: true,
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
    priorityLocked: true,
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
    priorityLocked: true,
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

// Agrupacion del selector del formulario por intencion, en lenguaje del nutri:
// que quiere conseguir, no como se llama el tipo por dentro. Cada intencion
// reune uno o varios tipos del catalogo; el label de cada tipo se reescribe a
// una frase de accion. El vocabulario interno (type) no cambia.
export type IntentOption = { type: string; label: string };
export type IntentGroup = { intent: string; options: IntentOption[] };

export const CONSTRAINT_INTENTS: IntentGroup[] = [
  {
    intent: "Set an energy or macro goal",
    options: [
      { type: "kcal_target", label: "Daily calorie goal" },
      { type: "macro_target", label: "Daily goal for a macronutrient" },
    ],
  },
  {
    intent: "Set a nutrient floor or cap",
    options: [
      { type: "nutrient_min", label: "At least a certain amount of a nutrient" },
      { type: "nutrient_max", label: "No more than a certain amount of a nutrient" },
      { type: "nutrient_ratio", label: "Keep two nutrients in balance" },
    ],
  },
  {
    intent: "Avoid a food or family",
    options: [
      { type: "forbid_tag", label: "Never a whole family (allergy, intolerance)" },
      { type: "forbid_food", label: "Never a specific food" },
      { type: "forbid_combination", label: "Never two items in the same meal" },
    ],
  },
  {
    intent: "Favor a food or family",
    options: [
      { type: "prefer_tag", label: "Favor a whole family" },
      { type: "prefer_food", label: "Favor a specific food" },
    ],
  },
  {
    intent: "Shape the daily meals",
    options: [{ type: "meal_kcal_ratio", label: "Share of calories per meal" }],
  },
  {
    intent: "Limit how often something appears",
    options: [
      { type: "max_servings_per_period", label: "Cap servings over a window of days" },
      { type: "no_repeat_food", label: "Space out a food so it does not repeat" },
    ],
  },
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
