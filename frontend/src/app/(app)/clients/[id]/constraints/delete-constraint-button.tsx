"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";
import {
  deleteClientConstraint,
  type ConstraintFormState,
} from "./_actions";

const initialState: ConstraintFormState = { error: null };

export function DeleteConstraintButton({
  clientId,
  constraintId,
  label,
}: {
  clientId: number;
  constraintId: number;
  label: string;
}) {
  const [, formAction] = useFormState(deleteClientConstraint, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(`Remove "${label}"?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="constraint_id" value={constraintId} />
      <RemoveButton />
    </form>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Remove constraint"
      className="text-muted-foreground transition-colors hover:text-danger disabled:opacity-50"
    >
      <Trash2 className="size-4" />
    </button>
  );
}
