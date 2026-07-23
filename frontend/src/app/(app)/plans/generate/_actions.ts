"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { enqueueTask } from "@/lib/backend";
import { constraintMeta } from "@/lib/constraints";
import type { ProposedConstraint } from "@/lib/generation";

export type StartState = { error: string | null };

// Paso 1: el nutri elige cliente, escribe texto libre y fija los parametros.
// Encola una tarea 'translate' y salta a la espera del modal (?task=<id>).
export async function startTranslation(
  _prev: StartState,
  formData: FormData
): Promise<StartState> {
  const clientId = Number(formData.get("client_id"));
  const text = String(formData.get("input_text") ?? "").trim();
  const durationDays = Number(formData.get("duration_days")) || 7;
  const mealsPerDay = Number(formData.get("meals_per_day")) || 5;

  if (!Number.isInteger(clientId) || clientId <= 0) {
    return { error: "Pick a client." };
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

// Paso 3: el nutri decidio permanent/temporary por constraint. Las permanent se
// guardan como filas diet_constraint (source llm); las temporary viajan en la
// tarea 'generate'. Nada se persiste sin su decision.
export async function confirmGeneration(
  _prev: ConfirmState,
  formData: FormData
): Promise<ConfirmState> {
  const clientId = Number(formData.get("client_id"));
  const durationDays = Number(formData.get("duration_days")) || 7;
  const mealsPerDay = Number(formData.get("meals_per_day")) || 5;
  const raw = String(formData.get("constraints") ?? "[]");
  const decisionsRaw = String(formData.get("decisions") ?? "{}");

  if (!Number.isInteger(clientId) || clientId <= 0) {
    return { error: "Invalid client." };
  }

  let proposed: ProposedConstraint[];
  let decisions: Record<string, "permanent" | "temporary" | "discard">;
  try {
    proposed = JSON.parse(raw);
    decisions = JSON.parse(decisionsRaw);
  } catch {
    return { error: "Could not read the reviewed constraints." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const permanent: ProposedConstraint[] = [];
  const temporary: ProposedConstraint[] = [];
  proposed.forEach((c, i) => {
    const d = decisions[String(i)] ?? "temporary";
    if (d === "permanent") permanent.push(c);
    else if (d === "temporary") temporary.push(c);
    // discard: dropped on purpose
  });

  // Persistir las permanent. La policy exige que el cliente sea del nutri.
  if (permanent.length > 0) {
    const rows = permanent.map((c) => ({
      scope_type: "client",
      scope_client_id: clientId,
      type: c.type,
      operator: constraintMeta(c.type)?.operator ?? null,
      priority: c.priority,
      weight: c.weight ?? 5,
      value: c.value ?? null,
      value2: c.value2 ?? null,
      target_food_id: c.target_food_id ?? null,
      target_tag_id: c.target_tag_id ?? null,
      target_nutrient_id: c.target_nutrient_id ?? null,
      context: c.context ?? {},
      source: "llm",
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
