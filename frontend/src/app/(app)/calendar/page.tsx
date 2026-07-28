import Link from "next/link";
import { requireNutritionist } from "@/lib/supabase/session";
import {
  splitUpcomingPast,
  appointmentStatusLabel,
  appointmentStatusVariant,
  appointmentExpired,
  formatAppointmentWhen,
  type AppointmentRow,
} from "@/lib/appointments";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewAppointmentDialog } from "./new-appointment-dialog";
import { RequestActions } from "./request-actions";

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

  const now = new Date();
  const { upcoming, past } = splitUpcomingPast(appointments, now);

  // Las peticiones del cliente van arriba y aparte: son lo unico que espera una
  // respuesta, y perdidas entre las confirmadas se quedarian sin contestar.
  const requests = upcoming.filter((a) => a.status === "pending");
  const booked = upcoming.filter((a) => a.status !== "pending");

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

      {requests.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Requests waiting for you ({requests.length})
          </h2>
          <div className="flex flex-col gap-2">
            {requests.map((a) => (
              <AppointmentRowCard key={a.id} appointment={a} now={now} />
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Upcoming
        </h2>
        {booked.length === 0 ? (
          <Card>
            <p className="py-8 text-center text-sm text-muted-foreground">
              No appointments scheduled.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {booked.map((a) => (
              <AppointmentRowCard key={a.id} appointment={a} now={now} />
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
              <AppointmentRowCard key={a.id} appointment={a} now={now} past />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function AppointmentRowCard({
  appointment,
  now,
  past,
}: {
  appointment: AppointmentRow;
  now: Date;
  past?: boolean;
}) {
  const name = appointment.client?.full_name_pseudonym ?? "Unknown client";
  // Una peticion vencida ya no se contesta: la hora paso. Se sigue viendo, con
  // su etiqueta, para que quede constancia de que se quedo sin respuesta.
  const answerable =
    appointment.status === "pending" &&
    !appointmentExpired(appointment.status, appointment.scheduled_at, now);

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
            <Badge
              variant={appointmentStatusVariant(
                appointment.status,
                appointment.scheduled_at,
                now
              )}
            >
              {appointmentStatusLabel(
                appointment.status,
                appointment.scheduled_at,
                now
              )}
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
        {answerable && <RequestActions appointmentId={appointment.id} />}
      </div>
    </Card>
  );
}
