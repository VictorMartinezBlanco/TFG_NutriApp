"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { logWeight, type WeightState } from "./_actions";

const initialState: WeightState = { error: null, ok: false };

export function WeightForm({ todayValue }: { todayValue: number | null }) {
  const [state, formAction] = useFormState(logWeight, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label
            htmlFor="weight_kg"
            className="mb-1 block text-xs text-muted-foreground"
          >
            {todayValue !== null ? "Update today's weight" : "Log today's weight"}
          </label>
          <Input
            id="weight_kg"
            name="weight_kg"
            type="number"
            step="0.1"
            min="1"
            max="399"
            inputMode="decimal"
            placeholder="kg"
            defaultValue={todayValue ?? ""}
            required
          />
        </div>
        <SaveButton />
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving..." : "Save"}
    </Button>
  );
}
