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
