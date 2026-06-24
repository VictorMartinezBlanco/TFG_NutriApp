"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// warning != error: el warning no bloquea (el nutri manda sobre su agenda),
// solo avisa de que la hora cae fuera de su disponibilidad.
export type AppointmentFormState = {
  error: string | null;
  warning: string | null;
  ok: boolean;
};

// 0=lunes .. 6=domingo, como en la tabla availability.
function dayOfWeekMonday0(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

export async function createAppointment(
  _prev: AppointmentFormState,
  formData: FormData
): Promise<AppointmentFormState> {
  const clientId = Number(formData.get("client_id"));
  const scheduledRaw = String(formData.get("scheduled_at") ?? "").trim();
  const durationMin = Number(formData.get("duration_min"));
  const notes = String(formData.get("notes") ?? "").trim();

  if (!Number.isInteger(clientId) || clientId <= 0) {
    return { error: "Select a client.", warning: null, ok: false };
  }
  if (!scheduledRaw) {
    return { error: "Pick a date and time.", warning: null, ok: false };
  }
  const scheduled = new Date(scheduledRaw);
  if (Number.isNaN(scheduled.getTime())) {
    return { error: "Invalid date and time.", warning: null, ok: false };
  }
  if (!Number.isFinite(durationMin) || durationMin <= 0) {
    return { error: "Duration must be a positive number.", warning: null, ok: false };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // El cliente tiene que ser del nutri. La RLS ya lo garantiza al leer, pero se
  // comprueba explicitamente para dar un error claro en vez de un fallo de FK.
  const { data: client } = await supabase
    .from("client")
    .select("id")
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!client) {
    return { error: "That client does not exist.", warning: null, ok: false };
  }

  // Aviso si cae fuera de la disponibilidad de ese dia (no bloquea).
  let warning: string | null = null;
  const { data: blocks } = await supabase
    .from("availability")
    .select("start_time, end_time")
    .eq("day_of_week", dayOfWeekMonday0(scheduled));
  const minutes = scheduled.getHours() * 60 + scheduled.getMinutes();
  const insideSomeBlock = (blocks ?? []).some(
    (b) => minutes >= timeToMinutes(b.start_time) && minutes < timeToMinutes(b.end_time)
  );
  if (!blocks || blocks.length === 0 || !insideSomeBlock) {
    warning = "Heads up: this time is outside your availability.";
  }

  // nutritionist_id se fija al usuario logueado y la policy lo exige (doble defensa).
  const { error: insertError } = await supabase.from("appointment").insert({
    nutritionist_id: user.id,
    client_id: clientId,
    scheduled_at: scheduled.toISOString(),
    duration_min: durationMin,
    notes: notes || null,
  });
  if (insertError) {
    return {
      error: "Could not create the appointment. Please try again.",
      warning: null,
      ok: false,
    };
  }

  revalidatePath("/calendar");
  return { error: null, warning, ok: true };
}
