"use client";

import { useFormStatus } from "react-dom";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmAppointment, declineAppointment } from "./_actions";

// Las dos respuestas a una peticion del cliente. Dos formularios sueltos en vez
// de uno con dos submits, para que cada boton tenga su propio estado de envio.
export function RequestActions({ appointmentId }: { appointmentId: number }) {
  return (
    <div className="flex items-center gap-2">
      <form action={confirmAppointment}>
        <input type="hidden" name="appointment_id" value={appointmentId} />
        <ActionButton label="Confirm" pendingLabel="Confirming..." primary />
      </form>
      <form action={declineAppointment}>
        <input type="hidden" name="appointment_id" value={appointmentId} />
        <ActionButton label="Decline" pendingLabel="Declining..." />
      </form>
    </div>
  );
}

function ActionButton({
  label,
  pendingLabel,
  primary,
}: {
  label: string;
  pendingLabel: string;
  primary?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant={primary ? "primary" : "ghost"}
      disabled={pending}
    >
      {primary ? <Check className="size-4" /> : <X className="size-4" />}
      {pending ? pendingLabel : label}
    </Button>
  );
}
