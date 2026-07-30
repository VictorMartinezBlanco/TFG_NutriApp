"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signPlanAction, type SignFormState } from "./_actions";

const initialState: SignFormState = { error: null };

export function SignPlanButton({ planId }: { planId: number }) {
  const [state, formAction] = useFormState(signPlanAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="plan_id" value={planId} />
      <SubmitButton />
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Check className="size-4" />
      {pending ? "Signing..." : "Sign plan"}
    </Button>
  );
}
