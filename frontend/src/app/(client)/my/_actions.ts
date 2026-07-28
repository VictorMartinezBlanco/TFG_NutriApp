"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { REQUEST_DURATION_MIN } from "@/lib/availability";

const CLIENT_PATHS = ["/my/dashboard", "/my/plan", "/my/messages", "/my/appointments"];

function revalidateClientPanel() {
  for (const path of CLIENT_PATHS) revalidatePath(path);
}

// Sesion del cliente. Devuelve su id de ficha, que es lo que casi todo necesita.
async function clientSession() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("client")
    .select("id, nutritionist_id")
    .eq("auth_user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle<{ id: number; nutritionist_id: string }>();
  if (!data) redirect("/");

  return { supabase, clientId: data.id, nutritionistId: data.nutritionist_id };
}

// ---------- comidas cumplidas ----------

// Marcar y desmarcar. No lleva estado de error: la pantalla solo pinta el
// control en las comidas que se pueden marcar, y si aun asi la policy rechaza
// la escritura, el revalidate vuelve a pintar la verdad y la casilla se
// desmarca sola. La regla de verdad esta en la base de datos, no aqui.
export async function toggleMealCheck(formData: FormData): Promise<void> {
  const planId = Number(formData.get("plan_id"));
  const dayNum = Number(formData.get("day_num"));
  const mealTypeId = Number(formData.get("meal_type_id"));
  const wasChecked = formData.get("checked") === "1";

  if (!Number.isInteger(planId) || !Number.isInteger(dayNum) || !Number.isInteger(mealTypeId)) {
    return;
  }

  const { supabase } = await clientSession();

  if (wasChecked) {
    await supabase
      .from("meal_check")
      .delete()
      .eq("plan_id", planId)
      .eq("day_num", dayNum)
      .eq("meal_type_id", mealTypeId);
  } else {
    await supabase
      .from("meal_check")
      .insert({ plan_id: planId, day_num: dayNum, meal_type_id: mealTypeId });
  }

  revalidateClientPanel();
}

// ---------- peso ----------

export type WeightState = { error: string | null; ok: boolean };

export async function logWeight(
  _prev: WeightState,
  formData: FormData
): Promise<WeightState> {
  const weight = Number(String(formData.get("weight_kg") ?? "").replace(",", "."));
  if (!Number.isFinite(weight) || weight <= 0 || weight >= 400) {
    return { error: "Enter a weight between 1 and 400 kg.", ok: false };
  }

  const { supabase, clientId } = await clientSession();
  const today = new Date().toISOString().slice(0, 10);

  // Un peso por dia: volver a enviarlo corrige el de hoy en vez de duplicarlo.
  const { error } = await supabase
    .from("weight_entry")
    .upsert(
      { client_id: clientId, measured_on: today, weight_kg: weight },
      { onConflict: "client_id,measured_on" }
    );
  if (error) {
    return { error: "Could not save your weight. Please try again.", ok: false };
  }

  revalidateClientPanel();
  return { error: null, ok: true };
}

// ---------- mensajes ----------

export type SendState = { error: string | null };

export async function sendClientMessage(
  _prev: SendState,
  formData: FormData
): Promise<SendState> {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write a message first." };

  const { supabase, clientId, nutritionistId } = await clientSession();

  // sender fijado aqui y exigido tambien por la policy: sin ese guard un cliente
  // podria dejar en su hilo una linea firmada por su nutricionista.
  const { error } = await supabase.from("message").insert({
    nutritionist_id: nutritionistId,
    client_id: clientId,
    sender: "client",
    body,
  });
  if (error) {
    return { error: "Could not send the message. Please try again." };
  }

  revalidatePath("/my/messages");
  return { error: null };
}

// ---------- citas ----------

export type AppointmentState = { error: string | null; ok: boolean };

export async function requestAppointment(
  _prev: AppointmentState,
  formData: FormData
): Promise<AppointmentState> {
  const startsAt = String(formData.get("starts_at") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  const when = Date.parse(startsAt);
  if (!Number.isFinite(when)) {
    return { error: "Pick a time slot first.", ok: false };
  }
  if (when <= Date.now()) {
    return { error: "That slot has already passed. Pick another one.", ok: false };
  }

  const { supabase, clientId, nutritionistId } = await clientSession();

  // Solape contra las citas del PROPIO cliente. Las de otros no se pueden
  // comprobar aqui, porque la RLS no le deja ver la agenda ajena: por eso la
  // peticion queda pendiente y es el profesional quien la confirma.
  const { data: own } = await supabase
    .from("appointment")
    .select("scheduled_at, duration_min")
    .neq("status", "cancelled")
    .is("deleted_at", null);

  const end = when + REQUEST_DURATION_MIN * 60_000;
  const clash = (own ?? []).some((a) => {
    const s = Date.parse(a.scheduled_at);
    return when < s + a.duration_min * 60_000 && end > s;
  });
  if (clash) {
    return { error: "You already have an appointment at that time.", ok: false };
  }

  const { error } = await supabase.from("appointment").insert({
    nutritionist_id: nutritionistId,
    client_id: clientId,
    scheduled_at: new Date(when).toISOString(),
    duration_min: REQUEST_DURATION_MIN,
    status: "pending",
    notes: notes || null,
  });
  if (error) {
    return { error: "Could not send your request. Please try again.", ok: false };
  }

  revalidateClientPanel();
  return { error: null, ok: true };
}

// Cancelar va por funcion y no por un update: una policy de UPDATE le dejaria
// mover tambien la fecha de la cita.
export async function cancelAppointment(formData: FormData): Promise<void> {
  const id = Number(formData.get("appointment_id"));
  if (!Number.isInteger(id) || id <= 0) return;

  const { supabase } = await clientSession();
  await supabase.rpc("client_cancel_appointment", { p_appointment_id: id });

  revalidateClientPanel();
}
