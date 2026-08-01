// Cliente server-side de la API de planes. Se usa solo desde Server Actions, con
// el secreto compartido en la cabecera; nunca desde el navegador (las variables
// no llevan NEXT_PUBLIC_). Devuelve el cuerpo del contrato tal cual.

const API_URL = process.env.NUTRIAPP_API_URL;
const API_TOKEN = process.env.NUTRIAPP_API_TOKEN;

export type GenerateResult =
  | { ok: true; status: "feasible"; planId: number | null }
  | { ok: true; status: "infeasible"; suggestion: string }
  | { ok: false; error: string };

type GeneratePayload = {
  nutritionistId: string;
  clientId: number;
  durationDays: number;
  mealsPerDay: number;
};

export async function generatePlan(p: GeneratePayload): Promise<GenerateResult> {
  if (!API_URL || !API_TOKEN) {
    return { ok: false, error: "The plan service is not configured." };
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/plans/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify({
        nutritionist_id: p.nutritionistId,
        client_id: p.clientId,
        duration_days: p.durationDays,
        meals_per_day: p.mealsPerDay,
        persist: true,
      }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Could not reach the plan service." };
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.detail ? String(body.detail) : `Request failed (${res.status}).`;
    return { ok: false, error: detail };
  }

  if (body?.status === "infeasible") {
    return { ok: true, status: "infeasible", suggestion: String(body.suggestion ?? "") };
  }
  return { ok: true, status: "feasible", planId: body?.plan_id ?? null };
}

export type EnqueueResult =
  | { ok: true; taskId: number }
  | { ok: false; error: string };

type EnqueuePayload = {
  nutritionistId: string;
  clientId: number;
  kind: "translate" | "generate";
  inputText?: string | null;
  constraints?: unknown[];
  durationDays?: number;
  mealsPerDay?: number;
};

// Deja una tarea en la cola y vuelve al instante con su id. El worker local la
// procesa; el frontend consulta el estado por RLS.
export async function enqueueTask(p: EnqueuePayload): Promise<EnqueueResult> {
  if (!API_URL || !API_TOKEN) {
    return { ok: false, error: "The plan service is not configured." };
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/generation-tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify({
        nutritionist_id: p.nutritionistId,
        client_id: p.clientId,
        kind: p.kind,
        input_text: p.inputText ?? null,
        constraints: p.constraints ?? [],
        duration_days: p.durationDays ?? 7,
        meals_per_day: p.mealsPerDay ?? 4,
      }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Could not reach the plan service." };
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.detail ? String(body.detail) : `Request failed (${res.status}).`;
    return { ok: false, error: detail };
  }
  return { ok: true, taskId: Number(body?.task_id) };
}

export type SignResult = { ok: true } | { ok: false; error: string };

// Firma un plan en borrador. El endpoint re-valida el plan y la propiedad
// antes de poner approved_at; aqui solo se transporta la decision del nutri.
export async function signPlan(p: {
  planId: number;
  nutritionistId: string;
}): Promise<SignResult> {
  if (!API_URL || !API_TOKEN) {
    return { ok: false, error: "The plan service is not configured." };
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/plans/${p.planId}/sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify({ nutritionist_id: p.nutritionistId }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Could not reach the plan service." };
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.detail ? String(body.detail) : `Request failed (${res.status}).`;
    return { ok: false, error: detail };
  }
  return { ok: true };
}
