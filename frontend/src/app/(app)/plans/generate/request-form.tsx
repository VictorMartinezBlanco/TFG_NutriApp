"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Loader2, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { startTranslation, type StartState } from "./_actions";

type ClientRow = { id: number; full_name_pseudonym: string };

const initial: StartState = { error: null };

const EXAMPLE =
  "e.g. Coeliac, around 2000 kcal a day, no pork, at least 120 g of protein. " +
  "Prefers fish and vegetables.";

export function RequestForm({
  clients,
  defaultClientId,
  defaultText,
}: {
  clients: ClientRow[];
  defaultClientId: number | null;
  defaultText?: string;
}) {
  const [state, formAction] = useFormState(startTranslation, initial);

  return (
    <Card className="max-w-2xl">
      <form action={formAction} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client_id">Client</Label>
          <select
            id="client_id"
            name="client_id"
            required
            defaultValue={defaultClientId ? String(defaultClientId) : ""}
            className="h-10 rounded-control border border-border bg-card px-3 text-sm"
          >
            <option value="" disabled>
              Select a client
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name_pseudonym}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="input_text">Notes for the copilot</Label>
          <textarea
            id="input_text"
            name="input_text"
            required
            rows={5}
            placeholder={EXAMPLE}
            defaultValue={defaultText}
            className="rounded-control border border-border bg-card px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Write in plain language. The copilot turns it into constraints you
            review before anything is generated.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="duration_days">Days</Label>
            <Input
              id="duration_days"
              name="duration_days"
              type="number"
              min={1}
              max={90}
              defaultValue={7}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meals_per_day">Meals per day</Label>
            <Input
              id="meals_per_day"
              name="meals_per_day"
              type="number"
              min={1}
              max={6}
              defaultValue={4}
            />
          </div>
        </div>

        {state.error && <p className="text-sm text-danger">{state.error}</p>}

        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton />
          <ManualButton />
        </div>
      </form>
    </Card>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Sparkles className="size-4" />
      )}
      {pending ? "Reading your notes..." : "Read notes"}
    </Button>
  );
}

// Via manual completa: salta el traductor y va directo a la revision. Mismo
// form (conserva cliente y parametros); formNoValidate evita que el required
// del textarea bloquee el envio sin texto.
function ManualButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="mode"
      value="manual"
      formNoValidate
      disabled={pending}
      className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      Skip the copilot and set the constraints by hand
    </button>
  );
}
