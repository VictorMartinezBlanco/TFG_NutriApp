"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ProfileState = { error: string | null; ok: boolean };
export type AvailabilityState = { error: string | null; ok: boolean };

export async function updateProfile(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const licenseNumber = String(formData.get("license_number") ?? "").trim();

  if (!fullName) {
    return { error: "Full name is required.", ok: false };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // La policy p_nutri_self limita el update a la propia fila.
  const { error } = await supabase
    .from("nutritionist")
    .update({ full_name: fullName, license_number: licenseNumber || null })
    .eq("id", user.id);
  if (error) {
    return { error: "Could not save your profile. Please try again.", ok: false };
  }

  revalidatePath("/settings");
  return { error: null, ok: true };
}

// Set-replace: borra toda la disponibilidad del nutri y reinserta la del form.
// PostgREST no da transaccion multi-paso, asi que si el INSERT falla tras el
// DELETE la disponibilidad queda vacia; se avisa al usuario para que reintente.
export async function replaceAvailability(
  _prev: AvailabilityState,
  formData: FormData
): Promise<AvailabilityState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // El form manda triples day/start/end alineados por indice.
  const days = formData.getAll("block_day").map((v) => Number(v));
  const starts = formData.getAll("block_start").map((v) => String(v));
  const ends = formData.getAll("block_end").map((v) => String(v));

  const rows: { nutritionist_id: string; day_of_week: number; start_time: string; end_time: string }[] = [];
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const start = starts[i];
    const end = ends[i];
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    if (!start || !end) continue;
    if (start >= end) {
      return { error: "Each block must start before it ends.", ok: false };
    }
    rows.push({
      nutritionist_id: user.id,
      day_of_week: day,
      start_time: start,
      end_time: end,
    });
  }

  const { error: deleteError } = await supabase
    .from("availability")
    .delete()
    .eq("nutritionist_id", user.id);
  if (deleteError) {
    return { error: "Could not save availability, please try again.", ok: false };
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("availability").insert(rows);
    if (insertError) {
      return { error: "Could not save availability, please try again.", ok: false };
    }
  }

  revalidatePath("/settings");
  return { error: null, ok: true };
}
