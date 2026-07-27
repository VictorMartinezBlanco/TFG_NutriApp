// Formas y etiquetas del flujo de generacion asincrona. Una tarea vive en la
// tabla generation_task; el worker local la procesa y deja el resultado. El
// frontend encola por la API y lee el estado por RLS.

import {
  constraintSentence,
  priorityLabel as priorityLabelBase,
  type ConstraintParts,
} from "./constraints";

export type TaskStatus = "queued" | "in_progress" | "done" | "failed";
export type TaskKind = "translate" | "generate";

// Veredicto de las pasadas previas al traductor. Un status distinto de ok llega
// con un mensaje redactado para el nutri y los detalles que lo respaldan.
export type PrecheckStatus =
  | "ok"
  | "out_of_scope"
  | "unsupported_language"
  | "missing_info"
  | "contradiction";

export type Precheck = {
  status: PrecheckStatus;
  message: string;
  details: string[];
};

// Diagnostico de un generate infactible: la explicacion llana (tambien en la
// columna error) y el nucleo del conflicto con nombres reales del catalogo.
export type InfeasibleCoreItem = {
  type: string;
  value: number | null;
  target: string | null;
};

export type InfeasibleInfo = {
  explanation: string | null;
  core: InfeasibleCoreItem[];
};

// Constraint tal y como la deja el worker en result (forma cruda de ConstraintIn:
// targets por id, sin los embeds de nombre que si tiene diet_constraint).
export type ProposedConstraint = {
  type: string;
  priority: "hard" | "soft";
  weight?: number;
  operator?: string | null;
  value?: number | null;
  value2?: number | null;
  target_food_id?: number | null;
  target_tag_id?: number | null;
  target_nutrient_id?: number | null;
  context?: Record<string, unknown>;
};

export type RejectedItem = { raw: Record<string, unknown>; reason: string };

export type TranslateResult = {
  constraints?: ProposedConstraint[];
  rejected?: RejectedItem[];
  model?: string;
  latency_ms?: number;
  precheck?: Precheck;
};

export type GenerationTask = {
  id: number;
  client_id: number;
  kind: TaskKind;
  status: TaskStatus;
  plan_id: number | null;
  input_text: string | null;
  error: string | null;
  result:
    | (TranslateResult & { findings?: unknown[]; infeasible?: InfeasibleInfo })
    | null;
  created_at: string;
  finished_at?: string | null;
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
  nutrientUnits: Record<number, string>;
  tags: Record<number, string>;
  foods: Record<number, string>;
};

// Presentacion de cada estado de precheck: etiqueta corta y tono del badge. El
// mensaje y los detalles vienen redactados del backend; esto solo pone el marco.
export function precheckPresentation(
  status: Exclude<PrecheckStatus, "ok">
): { label: string; variant: "info" | "warning" | "critical" } {
  switch (status) {
    case "out_of_scope":
      return { label: "Out of scope", variant: "info" };
    case "unsupported_language":
      return { label: "Language not supported", variant: "info" };
    case "missing_info":
      return { label: "Missing information", variant: "warning" };
    case "contradiction":
      return { label: "Contradiction", variant: "critical" };
  }
}

// Frase corta de un elemento del nucleo de infactibilidad. El target ya viene
// resuelto a nombre; solo hay que colocarlo en el hueco que su tipo espera.
export function coreLine(item: InfeasibleCoreItem): string {
  const parts: ConstraintParts = { type: item.type, value: item.value };
  const target = item.target ?? undefined;
  if (item.type.startsWith("nutrient_") || item.type === "macro_target") {
    parts.nutrient = target;
  } else if (item.type.endsWith("_tag")) {
    parts.tag = target;
  } else {
    parts.food = target;
  }
  return constraintSentence(parts);
}

export function proposedLabel(c: ProposedConstraint, names: NameMaps): string {
  const windowDays = c.context && typeof c.context.window_days === "number"
    ? (c.context.window_days as number)
    : null;
  return constraintSentence({
    type: c.type,
    operator: c.operator,
    value: c.value,
    nutrient: c.target_nutrient_id ? names.nutrients[c.target_nutrient_id] : undefined,
    unit: c.target_nutrient_id ? names.nutrientUnits[c.target_nutrient_id] : undefined,
    tag: c.target_tag_id ? names.tags[c.target_tag_id] : undefined,
    food: c.target_food_id ? names.foods[c.target_food_id] : undefined,
    windowDays,
  });
}

export const priorityLabel = priorityLabelBase;
