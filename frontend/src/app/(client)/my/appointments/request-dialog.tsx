"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { REQUEST_DURATION_MIN, type SlotDay } from "@/lib/availability";
import { requestAppointment, type AppointmentState } from "../_actions";

const initialState: AppointmentState = { error: null, ok: false };

export function RequestAppointmentDialog({ slotDays }: { slotDays: SlotDay[] }) {
  const [open, setOpen] = React.useState(false);
  const [dayIndex, setDayIndex] = React.useState(0);
  const [slot, setSlot] = React.useState<string>("");
  const [state, formAction] = useFormState(requestAppointment, initialState);

  React.useEffect(() => {
    if (state.ok) {
      setOpen(false);
      setSlot("");
    }
  }, [state]);

  const day = slotDays[dayIndex];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={slotDays.length === 0}>
          <Plus className="size-4" />
          Request appointment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request an appointment</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="starts_at" value={slot} />

          <div>
            <p className="mb-2 text-sm font-medium">Day</p>
            <div className="flex flex-wrap gap-2">
              {slotDays.map((d, i) => (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => {
                    setDayIndex(i);
                    setSlot("");
                  }}
                  className={`rounded-control border px-3 py-1.5 text-sm ${
                    i === dayIndex
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-input text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">
              Time ({REQUEST_DURATION_MIN} min)
            </p>
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
              {day?.slots.map((s) => (
                <button
                  key={s.startsAt}
                  type="button"
                  onClick={() => setSlot(s.startsAt)}
                  className={`rounded-control border px-3 py-1.5 text-sm ${
                    slot === s.startsAt
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-input text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="notes" className="mb-1 block text-sm font-medium">
              What would you like to discuss? (optional)
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              className="w-full resize-none rounded-control border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Your nutritionist will confirm the appointment. Until then it stays
            pending.
          </p>

          {state.error && <p className="text-sm text-danger">{state.error}</p>}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <SubmitButton disabled={!slot} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={disabled || pending}>
      {pending ? "Sending..." : "Send request"}
    </Button>
  );
}
