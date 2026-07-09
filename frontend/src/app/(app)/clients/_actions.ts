"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ClientFormState = { error: string | null };

const SEX_VALUES = ["M", "F", "X"];
const ACTIVITY_VALUES = ["sedentary", "light", "moderate", "active", "very_active"];

function parseNumber(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
}

export async function createClientRecord(
  _prev: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  const name = String(formData.get("full_name_pseudonym") ?? "").trim();
  if (!name) {
    return { error: "Name is required." };
  }

  const sex = String(formData.get("sex") ?? "").trim();
  if (sex && !SEX_VALUES.includes(sex)) {
    return { error: "Invalid sex value." };
  }

  const activity = String(formData.get("activity_level") ?? "").trim();
  if (activity && !ACTIVITY_VALUES.includes(activity)) {
    return { error: "Invalid activity level." };
  }

  const birthDate = String(formData.get("birth_date") ?? "").trim();
  if (birthDate) {
    const d = new Date(birthDate);
    if (Number.isNaN(d.getTime()) || d.getTime() > Date.now()) {
      return { error: "Date of birth must be a valid past date." };
    }
  }

  // el tope de 300/500 evita el overflow del NUMERIC(5,2) (max 999.99) y ademas
  // descarta valores absurdos como meter la altura en mm.
  const height = parseNumber(formData.get("height_cm"));
  if (height != null && (Number.isNaN(height) || height <= 0 || height > 300)) {
    return { error: "Height must be between 0 and 300 cm." };
  }
  const weight = parseNumber(formData.get("weight_kg"));
  if (weight != null && (Number.isNaN(weight) || weight <= 0 || weight > 500)) {
    return { error: "Weight must be between 0 and 500 kg." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // nutritionist_id se fija al usuario logueado; la policy p_client_owner ademas
  // lo exige en su WITH CHECK.
  const { error } = await supabase.from("client").insert({
    nutritionist_id: user.id,
    full_name_pseudonym: name,
    sex: sex || null,
    birth_date: birthDate || null,
    height_cm: height,
    weight_kg: weight,
    activity_level: activity || null,
  });

  if (error) {
    return { error: "Could not create the client. " + error.message };
  }

  revalidatePath("/clients");
  redirect("/clients");
}
