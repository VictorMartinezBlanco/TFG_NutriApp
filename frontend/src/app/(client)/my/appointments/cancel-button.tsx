"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { cancelAppointment } from "../_actions";

export function CancelAppointmentButton({ appointmentId }: { appointmentId: number }) {
  return (
    <form action={cancelAppointment}>
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" size="sm" disabled={pending}>
      {pending ? "Cancelling..." : "Cancel"}
    </Button>
  );
}
