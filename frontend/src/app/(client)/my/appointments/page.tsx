import { requireClient } from "@/lib/supabase/session";
import {
  splitUpcomingPast,
  appointmentStatusLabel,
  appointmentStatusVariant,
  appointmentExpired,
  formatAppointmentWhen,
  type AppointmentRow,
} from "@/lib/appointments";
import {
  buildSlotDays,
  weekdayLabel,
  timeRangeLabel,
  type AvailabilityRow,
} from "@/lib/availability";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RequestAppointmentDialog } from "./request-dialog";
import { CancelAppointmentButton } from "./cancel-button";

export const dynamic = "force-dynamic";

export default async function MyAppointmentsPage() {
  const { supabase } = await requireClient();
  const now = new Date();

  const [{ data: apptData }, { data: availData }, { data: nutri }] =
    await Promise.all([
      supabase
        .from("appointment")
        .select("id, scheduled_at, duration_min, status, notes")
        .is("deleted_at", null),
      supabase
        .from("availability")
        .select("day_of_week, start_time, end_time")
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true }),
      supabase.from("nutritionist").select("full_name").limit(1),
    ]);

  const appointments = ((apptData as AppointmentRow[] | null) ?? []).map((a) => ({
    ...a,
    client: null,
  }));
  const availability = (availData as AvailabilityRow[] | null) ?? [];
  const nutritionistName =
    (nutri as { full_name: string }[] | null)?.[0]?.full_name ??
    "your nutritionist";

  const { upcoming, past } = splitUpcomingPast(appointments, now);
  const active = appointments.filter((a) => a.status !== "cancelled");
  const slotDays = buildSlotDays(availability, active, now);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Appointments</h1>
          <p className="text-sm text-muted-foreground">
            Your sessions with {nutritionistName}.
          </p>
        </div>
        <RequestAppointmentDialog slotDays={slotDays} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <Card>
            <p className="py-8 text-center text-sm text-muted-foreground">
              {slotDays.length === 0
                ? "Your nutritionist has not published any availability yet."
                : "No upcoming appointments. Request one when you need it."}
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {upcoming.map((a) => (
              <AppointmentCard key={a.id} appointment={a} now={now} />
            ))}
          </div>
        )}
      </section>

      {availability.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>When you can book</CardTitle>
          </CardHeader>
          <ul className="flex flex-col divide-y divide-border text-sm">
            {availability.map((a, i) => (
              <li
                key={`${a.day_of_week}-${a.start_time}-${i}`}
                className="flex items-center justify-between py-2"
              >
                <span className="font-medium">{weekdayLabel(a.day_of_week)}</span>
                <span className="text-muted-foreground">
                  {timeRangeLabel(a.start_time, a.end_time)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            These are the hours your nutritionist works. A request is not a
            booking until they confirm it.
          </p>
        </Card>
      )}

      {past.length > 0 && (
        <details className="flex flex-col gap-3">
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
            Past ({past.length})
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            {past.map((a) => (
              <AppointmentCard key={a.id} appointment={a} now={now} past />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function AppointmentCard({
  appointment,
  now,
  past,
}: {
  appointment: AppointmentRow;
  now: Date;
  past?: boolean;
}) {
  // Cancelable mientras no haya pasado y siga viva. Una peticion vencida ya no
  // se cancela: no hay nada que cancelar.
  const cancellable =
    !past &&
    !appointmentExpired(appointment.status, appointment.scheduled_at, now) &&
    (appointment.status === "pending" || appointment.status === "scheduled");

  return (
    <Card className={past ? "opacity-70" : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              {formatAppointmentWhen(
                appointment.scheduled_at,
                appointment.duration_min
              )}
            </span>
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
            {appointment.duration_min} min
          </p>
          {appointment.notes && (
            <p className="text-sm text-muted-foreground">{appointment.notes}</p>
          )}
        </div>
        {cancellable && <CancelAppointmentButton appointmentId={appointment.id} />}
      </div>
    </Card>
  );
}
