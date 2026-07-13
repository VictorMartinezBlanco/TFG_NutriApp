"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildConstraintRow } from "@/lib/constraint-row";

export type ConstraintFormState = { error: string | null };

export async function createClientConstraint(
  _prev: ConstraintFormState,
  formData: FormData
): Promise<ConstraintFormState> {
  const built = buildConstraintRow(formData);
  if (built.row === null) return { error: built.error };
  const row = built.row;
  const clientId = row.scope_client_id as number;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // la policy p_constraint_owner exige en su WITH CHECK que el scope_client_id
  // sea de un cliente del nutri logueado. no filtramos a mano por nutri.
  const { error } = await supabase.from("diet_constraint").insert(row);

  if (error) {
    // 23505 = choque con el indice unico parcial anti-duplicados.
    if (error.code === "23505") {
      return { error: "This constraint already exists for this client." };
    }
    return { error: "Could not save the constraint. " + error.message };
  }

  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}

export async function deleteClientConstraint(
  _prev: ConstraintFormState,
  formData: FormData
): Promise<ConstraintFormState> {
  const clientId = Number(formData.get("client_id"));
  const constraintId = Number(formData.get("constraint_id"));
  if (
    !Number.isInteger(clientId) ||
    clientId <= 0 ||
    !Number.isInteger(constraintId) ||
    constraintId <= 0
  ) {
    return { error: "Invalid request." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // soft-delete. la policy limita el update a las constraints de clientes del
  // nutri, asi que una id ajena no afecta a ninguna fila.
  const { error } = await supabase
    .from("diet_constraint")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", constraintId)
    .eq("scope_client_id", clientId)
    .is("deleted_at", null);

  if (error) {
    return { error: "Could not remove the constraint. " + error.message };
  }

  revalidatePath(`/clients/${clientId}`);
  return { error: null };
}
