import Link from "next/link";
import { requireNutritionist } from "@/lib/supabase/session";
import {
  splitUpcomingPast,
  appointmentStatusLabel,
  appointmentStatusVariant,
  formatAppointmentWhen,
  type AppointmentRow,
} from "@/lib/appointments";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewAppointmentDialog } from "./new-appointment-dialog";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const { supabase } = await requireNutritionist();

  // La RLS ya filtra por nutri. Join al cliente para el nombre.
  const [{ data: apptData }, { data: clientData }] = await Promise.all([
    supabase
      .from("appointment")
      .select(
        "id, scheduled_at, duration_min, status, notes, client:client_id (id, full_name_pseudonym)"
      )
      .is("deleted_at", null),
    supabase
      .from("client")
      .select("id, full_name_pseudonym")
      .is("deleted_at", null)
      .order("full_name_pseudonym", { ascending: true }),
  ]);

  const appointments = (apptData as AppointmentRow[] | null) ?? [];
  const clients = (clientData ?? []).map((c) => ({
    id: c.id as number,
    name: c.full_name_pseudonym as string,
  }));

  const { upcoming, past } = splitUpcomingPast(appointments, new Date());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            Your upcoming and past appointments.
          </p>
        </div>
        <NewAppointmentDialog clients={clients} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <Card>
            <p className="py-8 text-center text-sm text-muted-foreground">
              No appointments scheduled.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {upcoming.map((a) => (
              <AppointmentRowCard key={a.id} appointment={a} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <details className="flex flex-col gap-3">
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
            Past ({past.length})
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            {past.map((a) => (
              <AppointmentRowCard key={a.id} appointment={a} past />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function AppointmentRowCard({
  appointment,
  past,
}: {
  appointment: AppointmentRow;
  past?: boolean;
}) {
  const name = appointment.client?.full_name_pseudonym ?? "Unknown client";
  return (
    <Card className={past ? "opacity-70" : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {appointment.client ? (
              <Link
                href={`/clients/${appointment.client.id}`}
                className="font-medium hover:text-brand"
              >
                {name}
              </Link>
            ) : (
              <span className="font-medium">{name}</span>
            )}
            <Badge variant={appointmentStatusVariant(appointment.status)}>
              {appointmentStatusLabel(appointment.status)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatAppointmentWhen(appointment.scheduled_at, appointment.duration_min)} ·{" "}
            {appointment.duration_min} min
          </p>
          {appointment.notes && (
            <p className="text-sm text-muted-foreground">{appointment.notes}</p>
          )}
        </div>
      </div>
    </Card>
  );
}
