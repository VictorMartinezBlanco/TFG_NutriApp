"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { updateProfile, type ProfileState } from "./_actions";

const initialState: ProfileState = { error: null, ok: false };

export function ProfileForm({
  fullName,
  email,
  licenseNumber,
}: {
  fullName: string;
  email: string;
  licenseNumber: string;
}) {
  const [state, formAction] = useFormState(updateProfile, initialState);
  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <span className="flex size-16 items-center justify-center rounded-full bg-brand-soft text-lg font-medium text-brand">
          {initials}
        </span>
        <button
          type="button"
          disabled
          className="text-sm text-muted-foreground"
          title="Available soon"
        >
          Change photo
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="full_name">Full name</Label>
        <Input id="full_name" name="full_name" defaultValue={fullName} required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} readOnly disabled />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Label htmlFor="specialization">Specialization</Label>
          <Badge variant="neutral">Available soon</Badge>
        </div>
        <Input
          id="specialization"
          placeholder="Not editable yet"
          disabled
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="license_number">License number</Label>
        <Input
          id="license_number"
          name="license_number"
          defaultValue={licenseNumber}
          placeholder="ESP-12345-NUT"
        />
      </div>

      {state.error && (
        <p className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-control bg-brand-soft px-3 py-2 text-sm text-brand">
          Profile saved.
        </p>
      )}

      <div>
        <SaveButton />
      </div>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving..." : "Save changes"}
    </Button>
  );
}
