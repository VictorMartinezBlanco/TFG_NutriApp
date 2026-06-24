"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createCustomFood, type FoodFormState } from "../_actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type TagOption = { id: number; name: string };

type TagGroup = { group: string; options: TagOption[] };

const initialState: FoodFormState = { error: null };

export function NewFoodForm({ tagGroups }: { tagGroups: TagGroup[] }) {
  const [state, formAction] = useFormState(createCustomFood, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name (English)" htmlFor="name_en" required>
          <Input id="name_en" name="name_en" required placeholder="Chicken breast" />
        </Field>
        <Field label="Name (Spanish)" htmlFor="name_es">
          <Input id="name_es" name="name_es" placeholder="Pechuga de pollo" />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-medium">Macros (per 100 g)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label="Energy (kcal)" name="energy_kcal" required />
          <NumberField label="Protein (g)" name="protein_g" required />
          <NumberField label="Carbohydrates (g)" name="carb_g" required />
          <NumberField label="Fat (g)" name="fat_g" required />
          <NumberField label="Fiber (g)" name="fiber_g" />
          <NumberField label="Saturated fat (g)" name="sat_fat_g" />
          <NumberField label="Added sugars (g)" name="sugar_added_g" />
          <NumberField label="Sodium (mg)" name="sodium_mg" />
        </div>
      </fieldset>

      <Field label="Typical serving (g)" htmlFor="typical_serving_g">
        <Input
          id="typical_serving_g"
          name="typical_serving_g"
          type="number"
          step="any"
          min="0"
          placeholder="150"
          className="max-w-[12rem]"
        />
      </Field>

      {tagGroups.length > 0 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">Tags</legend>
          <p className="text-xs text-muted-foreground">
            Allergens, intolerances, preferences and clinical markers for this food.
          </p>
          <div className="flex flex-col gap-4">
            {tagGroups.map(({ group, options }) => (
              <div key={group}>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group}
                </h4>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {options.map((tag) => (
                    <label
                      key={tag.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="tags"
                        value={tag.id}
                        className="size-4 rounded border-input accent-brand"
                      />
                      {tag.name}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      )}

      {state.error && (
        <p className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton />
        <a
          href="/foods"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
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
      {pending ? "Saving..." : "Save food"}
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

function NumberField({
  label,
  name,
  required,
}: {
  label: string;
  name: string;
  required?: boolean;
}) {
  return (
    <Field label={label} htmlFor={name} required={required}>
      <Input
        id={name}
        name={name}
        type="number"
        step="any"
        min="0"
        required={required}
      />
    </Field>
  );
}
