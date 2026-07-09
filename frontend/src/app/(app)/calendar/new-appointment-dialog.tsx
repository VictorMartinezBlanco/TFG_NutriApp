"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAppointment, type AppointmentFormState } from "./_actions";

type ClientOption = { id: number; name: string };

const initialState: AppointmentFormState = { error: null, warning: null, ok: false };

// Se usa desde el calendario con la lista de clientes, y desde la ficha de un
// cliente con lockedClient para dejar el cliente fijado.
export function NewAppointmentDialog({
  clients,
  lockedClient,
  triggerLabel = "New appointment",
  triggerVariant = "primary",
}: {
  clients?: ClientOption[];
  lockedClient?: ClientOption;
  triggerLabel?: string;
  triggerVariant?: "primary" | "outline";
}) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useFormState(createAppointment, initialState);

  // Cierra al crear con exito. Si hubo warning (hora fuera de disponibilidad)
  // se mantiene abierto para que el nutri lo vea antes de cerrar a mano.
  React.useEffect(() => {
    if (state.ok && !state.warning) setOpen(false);
  }, [state.ok, state.warning]);

  const options = clients ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={triggerVariant}>
          <Plus className="size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New appointment</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          {lockedClient ? (
            <>
              <input type="hidden" name="client_id" value={lockedClient.id} />
              <div className="flex flex-col gap-1.5">
                <Label>Client</Label>
                <p className="text-sm font-medium">{lockedClient.name}</p>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="client_id">
                Client<span className="text-danger"> *</span>
              </Label>
              <select
                id="client_id"
                name="client_id"
                required
                defaultValue=""
                className="h-10 rounded-control border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="" disabled>
                  Select a client
                </option>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scheduled_at">
                Date and time<span className="text-danger"> *</span>
              </Label>
              <Input id="scheduled_at" name="scheduled_at" type="datetime-local" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="duration_min">Duration (min)</Label>
              <Input
                id="duration_min"
                name="duration_min"
                type="number"
                min="1"
                step="1"
                defaultValue={60}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Optional notes for this appointment"
              className="rounded-control border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {state.error && (
            <p className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
              {state.error}
            </p>
          )}
          {state.warning && (
            <p className="rounded-control bg-warning/10 px-3 py-2 text-sm text-warning">
              {state.warning} The appointment was saved.
            </p>
          )}

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
            <SubmitButton />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving..." : "Create"}
    </Button>
  );
}
