"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generatePlan } from "@/lib/backend";

export type GenerateState = { error: string | null; suggestion: string | null };

// borrador por defecto: una semana, cinco comidas. el ajuste fino de estos
// parametros vive en las pantallas de generacion, no aqui.
const DEFAULT_DURATION_DAYS = 7;
const DEFAULT_MEALS_PER_DAY = 5;

export async function generateDraftPlan(
  _prev: GenerateState,
  formData: FormData
): Promise<GenerateState> {
  const clientId = Number(formData.get("client_id"));
  if (!Number.isInteger(clientId)) {
    return { error: "Invalid client.", suggestion: null };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const result = await generatePlan({
    nutritionistId: user.id,
    clientId,
    durationDays: DEFAULT_DURATION_DAYS,
    mealsPerDay: DEFAULT_MEALS_PER_DAY,
  });

  if (!result.ok) {
    return { error: result.error, suggestion: null };
  }
  if (result.status === "infeasible") {
    return { error: null, suggestion: result.suggestion };
  }

  // el borrador ya esta persistido; se abre su ficha para revisarlo y firmarlo.
  revalidatePath(`/clients/${clientId}`);
  if (result.planId) {
    redirect(`/plans/${result.planId}`);
  }
  redirect("/plans");
}
