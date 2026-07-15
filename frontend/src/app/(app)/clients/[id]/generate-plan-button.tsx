"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateDraftPlan, type GenerateState } from "./_actions";

const initialState: GenerateState = { error: null, suggestion: null };

export function GeneratePlanButton({ clientId }: { clientId: number }) {
  const [state, formAction] = useFormState(generateDraftPlan, initialState);

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="client_id" value={clientId} />
        <SubmitButton />
        <Button type="button" variant="outline" size="sm" disabled>
          Upload historical plan
        </Button>
        <Badge variant="info">Upload available soon</Badge>
      </form>

      {state.suggestion && (
        <p className="max-w-2xl rounded-control border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          The constraints cannot be satisfied together. {state.suggestion}
        </p>
      )}
      {state.error && (
        <p className="text-sm text-danger">{state.error}</p>
      )}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Sparkles className="size-4" />
      )}
      {pending ? "Generating draft..." : "Generate draft plan"}
    </Button>
  );
}
