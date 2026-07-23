// Formas y etiquetas del flujo de generacion asincrona. Una tarea vive en la
// tabla generation_task; el worker local la procesa y deja el resultado. El
// frontend encola por la API y lee el estado por RLS.

export type TaskStatus = "queued" | "in_progress" | "done" | "failed";
export type TaskKind = "translate" | "generate";

// Constraint tal y como la deja el worker en result (forma cruda de ConstraintIn:
// targets por id, sin los embeds de nombre que si tiene diet_constraint).
export type ProposedConstraint = {
  type: string;
  priority: "hard" | "soft";
  weight?: number;
  value?: number | null;
  value2?: number | null;
  target_food_id?: number | null;
  target_tag_id?: number | null;
  target_nutrient_id?: number | null;
  context?: Record<string, unknown>;
};

export type RejectedItem = { raw: Record<string, unknown>; reason: string };

export type TranslateResult = {
  constraints: ProposedConstraint[];
  rejected: RejectedItem[];
  model?: string;
  latency_ms?: number;
};

export type GenerationTask = {
  id: number;
  client_id: number;
  kind: TaskKind;
  status: TaskStatus;
  plan_id: number | null;
  input_text: string | null;
  error: string | null;
  result: TranslateResult | { findings?: unknown[]; rejected?: RejectedItem[] } | null;
  created_at: string;
};

export function statusLabel(status: TaskStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "in_progress":
      return "In progress";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
  }
}

export function statusVariant(
  status: TaskStatus
): "info" | "warning" | "success" | "critical" {
  switch (status) {
    case "queued":
      return "info";
    case "in_progress":
      return "warning";
    case "done":
      return "success";
    case "failed":
      return "critical";
  }
}

// Etiqueta legible de una constraint propuesta. No hay embeds de nombre en el
// resultado del worker, asi que se resuelven con los diccionarios que la pantalla
// carga aparte (nutrientes, tags, foods por id).
export type NameMaps = {
  nutrients: Record<number, string>;
  tags: Record<number, string>;
  foods: Record<number, string>;
};

export function proposedLabel(c: ProposedConstraint, names: NameMaps): string {
  const nutrient = c.target_nutrient_id ? names.nutrients[c.target_nutrient_id] : undefined;
  const tag = c.target_tag_id ? names.tags[c.target_tag_id] : undefined;
  const food = c.target_food_id ? names.foods[c.target_food_id] : undefined;

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
      return `Macro target ${c.value ?? "?"} g of ${nutrient ?? "macro"}`;
    case "nutrient_min":
      return `At least ${c.value ?? "?"} of ${nutrient ?? "nutrient"}`;
    case "nutrient_max":
      return `At most ${c.value ?? "?"} of ${nutrient ?? "nutrient"}`;
    case "nutrient_ratio":
      return `${nutrient ?? "nutrient"} ratio limit ${c.value ?? "?"}`;
    case "meal_kcal_ratio":
      return "Calorie split across meals";
    case "max_servings_per_period":
      return `At most ${c.value ?? "?"} servings of ${food ?? tag ?? "item"}`;
    case "forbid_combination":
      return `Do not combine ${food ?? tag ?? "item"} with another item`;
    case "no_repeat_tag":
      return `Do not repeat ${tag ?? "tag"} within ${c.value ?? "?"} days`;
    default:
      return c.type.replace(/_/g, " ");
  }
}

export function priorityLabel(p: "hard" | "soft"): string {
  return p === "hard" ? "Must" : "Prefer";
}
