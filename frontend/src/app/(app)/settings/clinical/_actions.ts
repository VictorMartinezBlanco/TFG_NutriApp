"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildConstraintRow } from "@/lib/constraint-row";
import type { ConstraintFormState } from "../../clients/[id]/constraints/_actions";

export async function createNutritionistConstraint(
  _prev: ConstraintFormState,
  formData: FormData
): Promise<ConstraintFormState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // el dueno lo fija el servidor a partir de la sesion, no el formulario.
  formData.set("nutritionist_id", user.id);
  const built = buildConstraintRow(formData, { scope: "nutritionist" });
  if (built.row === null) return { error: built.error };

  // la policy p_constraint_owner exige en su WITH CHECK que scope_nutritionist_id
  // sea el del nutri logueado. no filtramos a mano.
  const { error } = await supabase.from("diet_constraint").insert(built.row);

  if (error) {
    if (error.code === "23505") {
      return { error: "You already have this rule." };
    }
    return { error: "Could not save the rule. " + error.message };
  }

  revalidatePath("/settings");
  redirect("/settings?tab=clinical");
}

export async function deleteNutritionistConstraint(
  _prev: ConstraintFormState,
  formData: FormData
): Promise<ConstraintFormState> {
  const constraintId = Number(formData.get("constraint_id"));
  if (!Number.isInteger(constraintId) || constraintId <= 0) {
    return { error: "Invalid request." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // soft-delete acotado al propio nutri: una id ajena no afecta a ninguna fila.
  const { error } = await supabase
    .from("diet_constraint")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", constraintId)
    .eq("scope_nutritionist_id", user.id)
    .is("deleted_at", null);

  if (error) {
    return { error: "Could not remove the rule. " + error.message };
  }

  revalidatePath("/settings");
  return { error: null };
}
