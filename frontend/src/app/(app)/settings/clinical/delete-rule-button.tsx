"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";
import { deleteNutritionistConstraint } from "./_actions";
import type { ConstraintFormState } from "../../clients/[id]/constraints/_actions";

const initialState: ConstraintFormState = { error: null };

export function DeleteRuleButton({
  constraintId,
  label,
}: {
  constraintId: number;
  label: string;
}) {
  const [, formAction] = useFormState(deleteNutritionistConstraint, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(`Remove "${label}"?`)) e.preventDefault();
      }}
    >
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
      aria-label="Remove rule"
      className="text-muted-foreground transition-colors hover:text-danger disabled:opacity-50"
    >
      <Trash2 className="size-4" />
    </button>
  );
}
