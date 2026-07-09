"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createClientRecord, type ClientFormState } from "../_actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ClientFormState = { error: null };

const selectClass =
  "h-10 w-full rounded-control border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function NewClientForm() {
  const [state, formAction] = useFormState(createClientRecord, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Field label="Name or pseudonym" htmlFor="full_name_pseudonym" required>
        <Input
          id="full_name_pseudonym"
          name="full_name_pseudonym"
          required
          placeholder="Client name or pseudonym"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sex" htmlFor="sex">
          <select id="sex" name="sex" defaultValue="" className={selectClass}>
            <option value="">Not specified</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="X">Other</option>
          </select>
        </Field>
        <Field label="Date of birth" htmlFor="birth_date">
          <Input id="birth_date" name="birth_date" type="date" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Height (cm)" htmlFor="height_cm">
          <Input id="height_cm" name="height_cm" type="number" step="any" min="0" max="300" placeholder="170" />
        </Field>
        <Field label="Weight (kg)" htmlFor="weight_kg">
          <Input id="weight_kg" name="weight_kg" type="number" step="any" min="0" max="500" placeholder="65" />
        </Field>
      </div>

      <Field label="Activity level" htmlFor="activity_level">
        <select id="activity_level" name="activity_level" defaultValue="" className={`${selectClass} max-w-xs`}>
          <option value="">Not specified</option>
          <option value="sedentary">Sedentary</option>
          <option value="light">Light</option>
          <option value="moderate">Moderate</option>
          <option value="active">Active</option>
          <option value="very_active">Very active</option>
        </select>
      </Field>

      {state.error && (
        <p className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton />
        <a href="/clients" className="text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </a>
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Add client"}
    </Button>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-danger"> *</span>}
      </Label>
      {children}
    </div>
  );
}
