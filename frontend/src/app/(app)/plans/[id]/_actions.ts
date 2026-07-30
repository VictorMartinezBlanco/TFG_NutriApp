"use server";

import { revalidatePath } from "next/cache";
import { requireNutritionist } from "@/lib/supabase/session";
import { signPlan } from "@/lib/backend";

export type SignFormState = { error: string | null };

export async function signPlanAction(
  _prev: SignFormState,
  formData: FormData
): Promise<SignFormState> {
  const planId = Number(formData.get("plan_id"));
  if (!Number.isInteger(planId) || planId < 1) {
    return { error: "Invalid plan." };
  }

  const { user } = await requireNutritionist();

  // el endpoint comprueba que el plan sea de este nutri antes de firmar
  const result = await signPlan({ planId, nutritionistId: user.id });
  if (!result.ok) return { error: result.error };

  revalidatePath(`/plans/${planId}`);
  revalidatePath("/plans");
  return { error: null };
}
