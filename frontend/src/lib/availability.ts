// Huecos en los que el cliente puede pedir cita, a partir de la disponibilidad
// semanal que el profesional declaro en sus ajustes.
//
// day_of_week va 0=lunes .. 6=domingo, que es la convencion de la tabla y no la
// de Postgres ni la de Date.getDay().

export type AvailabilityRow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

export type Slot = { startsAt: string; label: string };
export type SlotDay = { date: string; label: string; slots: Slot[] };

export const REQUEST_DURATION_MIN = 30;
const SLOT_STEP_MIN = 30;
const HORIZON_DAYS = 14;

export function dayOfWeekMonday0(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Los huecos de los proximos catorce dias, quitando los que ya pasaron y los que
// pisan una cita que el propio cliente ya tiene.
//
// No se puede descartar lo que ocupan OTROS clientes: la RLS no le deja ver la
// agenda ajena, y esta bien que sea asi. De ahi que la peticion no sea una
// reserva: el solape real lo resuelve el profesional al confirmar.
export function buildSlotDays(
  availability: AvailabilityRow[],
  ownAppointments: { scheduled_at: string; duration_min: number }[],
  now: Date
): SlotDay[] {
  const busy = ownAppointments.map((a) => {
    const start = Date.parse(a.scheduled_at);
    return { start, end: start + a.duration_min * 60_000 };
  });

  const days: SlotDay[] = [];
  for (let offset = 0; offset < HORIZON_DAYS; offset += 1) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    date.setHours(0, 0, 0, 0);

    const blocks = availability.filter(
      (a) => a.day_of_week === dayOfWeekMonday0(date)
    );
    if (blocks.length === 0) continue;

    const slots: Slot[] = [];
    for (const block of blocks) {
      const from = minutesOf(block.start_time);
      const to = minutesOf(block.end_time);
      for (let m = from; m + REQUEST_DURATION_MIN <= to; m += SLOT_STEP_MIN) {
        const startsAt = new Date(date);
        startsAt.setMinutes(m);
        const start = startsAt.getTime();
        if (start <= now.getTime()) continue;
        const end = start + REQUEST_DURATION_MIN * 60_000;
        if (busy.some((b) => start < b.end && end > b.start)) continue;
        slots.push({
          startsAt: startsAt.toISOString(),
          label: startsAt.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
        });
      }
    }
    if (slots.length === 0) continue;

    days.push({
      date: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      }),
      slots,
    });
  }

  return days;
}

const WEEKDAY = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function weekdayLabel(dayOfWeek: number): string {
  return WEEKDAY[dayOfWeek] ?? `Day ${dayOfWeek}`;
}

export function timeRangeLabel(start: string, end: string): string {
  return `${start.slice(0, 5)} - ${end.slice(0, 5)}`;
}
