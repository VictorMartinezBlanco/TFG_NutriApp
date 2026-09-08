"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { enqueueTask } from "@/lib/backend";
import { constraintMeta } from "@/lib/constraints";
import type { ProposedConstraint } from "@/lib/generation";

export type StartState = { error: string | null };

// Paso 1: el nutri elige cliente, escribe texto libre y fija los parametros.
// Encola una tarea 'translate' y salta a la espera del modal (?task=<id>). La
// via manual no encola nada: salta directo a la revision vacia.
export async function startTranslation(
  _prev: StartState,
  formData: FormData
): Promise<StartState> {
  const clientId = Number(formData.get("client_id"));
  const text = String(formData.get("input_text") ?? "").trim();
  const durationDays = Number(formData.get("duration_days")) || 7;
  const mealsPerDay = Number(formData.get("meals_per_day")) || 4;
  const manual = String(formData.get("mode") ?? "") === "manual";

  if (!Number.isInteger(clientId) || clientId <= 0) {
    return { error: "Pick a client." };
  }
  if (manual) {
    redirect(
      `/plans/generate?review=manual&client=${clientId}` +
        `&days=${durationDays}&meals=${mealsPerDay}`
    );
  }
  if (!text) {
    return { error: "Write a few notes for the copilot to read." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const res = await enqueueTask({
    nutritionistId: user.id,
    clientId,
    kind: "translate",
    inputText: text,
    durationDays,
    mealsPerDay,
  });
  if (!res.ok) return { error: res.error };

  redirect(
    `/plans/generate?task=${res.taskId}&client=${clientId}` +
      `&days=${durationDays}&meals=${mealsPerDay}`
  );
}

export type ConfirmState = { error: string | null };

// Fila de la lista unificada de revision tal y como viaja en el form: la
// propuesta, quien la produjo (IA o el propio nutri) y la decision tomada.
type ReviewedItem = {
  c: ProposedConstraint;
  origin: "ai" | "manual";
  decision: "permanent" | "temporary" | "discard";
  unit_id: number | null;
};

// Paso 3: el nutri decidio permanent/temporary por fila, venga del traductor o
// del alta manual. Las permanent se guardan como filas diet_constraint con el
// source de su origen; las temporary viajan en la tarea 'generate'. Nada se
// persiste sin su decision.
export async function confirmGeneration(
  _prev: ConfirmState,
  formData: FormData
): Promise<ConfirmState> {
  const clientId = Number(formData.get("client_id"));
  const durationDays = Number(formData.get("duration_days")) || 7;
  const mealsPerDay = Number(formData.get("meals_per_day")) || 4;
  const raw = String(formData.get("items") ?? "[]");

  if (!Number.isInteger(clientId) || clientId <= 0) {
    return { error: "Invalid client." };
  }

  let items: ReviewedItem[];
  try {
    items = JSON.parse(raw);
  } catch {
    return { error: "Could not read the reviewed constraints." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const permanent = items.filter((it) => it.decision === "permanent");
  const temporary = items
    .filter((it) => it.decision === "temporary")
    .map((it) => it.c);

  // Persistir las permanent. La policy exige que el cliente sea del nutri.
  if (permanent.length > 0) {
    const rows = permanent.map((it) => ({
      scope_type: "client",
      scope_client_id: clientId,
      type: it.c.type,
      operator: it.c.operator ?? constraintMeta(it.c.type)?.operator ?? null,
      priority: it.c.priority,
      weight: it.c.weight ?? 5,
      value: it.c.value ?? null,
      value2: it.c.value2 ?? null,
      target_food_id: it.c.target_food_id ?? null,
      target_tag_id: it.c.target_tag_id ?? null,
      target_nutrient_id: it.c.target_nutrient_id ?? null,
      unit_id: it.unit_id ?? null,
      context: it.c.context ?? {},
      source: it.origin === "manual" ? "manual" : "llm",
    }));
    const { error } = await supabase.from("diet_constraint").insert(rows);
    if (error && error.code !== "23505") {
      return { error: "Could not save the permanent constraints. " + error.message };
    }
  }

  const res = await enqueueTask({
    nutritionistId: user.id,
    clientId,
    kind: "generate",
    constraints: temporary,
    durationDays,
    mealsPerDay,
  });
  if (!res.ok) return { error: res.error };

  redirect("/plans?tab=in-progress");
}
