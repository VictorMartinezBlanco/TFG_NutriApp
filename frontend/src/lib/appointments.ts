// Helpers de presentacion para las citas. El estado y la duracion vienen de la
// tabla appointment; aqui solo se formatean para la lista del calendario.

import type { BadgeProps } from "@/components/ui/badge";

export type AppointmentRow = {
  id: number;
  scheduled_at: string;
  duration_min: number;
  status: string;
  notes: string | null;
  client: { id: number; full_name_pseudonym: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  scheduled: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};

// Una peticion cuya fecha ya paso sigue siendo pending en la tabla: no hay nada
// que la cierre, porque no hay proceso periodico. Se etiqueta al pintarla, que
// es honesto en las dos caras. El profesional ve que dejo algo sin contestar y
// el cliente que su peticion se quedo sin respuesta, en vez de desaparecer.
export function appointmentExpired(
  status: string,
  scheduledAt: string,
  now: Date
): boolean {
  return status === "pending" && Date.parse(scheduledAt) < now.getTime();
}

export function appointmentStatusLabel(
  status: string,
  scheduledAt?: string,
  now: Date = new Date()
): string {
  if (scheduledAt && appointmentExpired(status, scheduledAt, now)) return "Expired";
  return STATUS_LABEL[status] ?? status;
}

export function appointmentStatusVariant(
  status: string,
  scheduledAt?: string,
  now: Date = new Date()
): BadgeProps["variant"] {
  if (scheduledAt && appointmentExpired(status, scheduledAt, now)) return "neutral";
  switch (status) {
    case "pending":
      return "warning";
    case "scheduled":
      return "info";
    case "completed":
      return "success";
    case "cancelled":
      return "neutral";
    case "no_show":
      return "warning";
    default:
      return "neutral";
  }
}

// "Wed, 25 Jun 2026 - 09:00-10:00" a partir del inicio y la duracion.
export function formatAppointmentWhen(iso: string, durationMin: number): string {
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start.getTime() + durationMin * 60_000);
  const day = start.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} · ${time(start)}-${time(end)}`;
}

// Separa en proximas (incluye en curso) y pasadas. Las pasadas mas recientes
// primero; las proximas, las mas cercanas primero.
export function splitUpcomingPast(rows: AppointmentRow[], now: Date) {
  const upcoming: AppointmentRow[] = [];
  const past: AppointmentRow[] = [];
  for (const row of rows) {
    const end = new Date(new Date(row.scheduled_at).getTime() + row.duration_min * 60_000);
    if (end.getTime() >= now.getTime()) upcoming.push(row);
    else past.push(row);
  }
  upcoming.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  past.sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  return { upcoming, past };
}
