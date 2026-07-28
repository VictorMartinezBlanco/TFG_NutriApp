"use client";

import { useFormStatus } from "react-dom";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleMealCheck } from "./_actions";

// Un formulario por comida. Sin estado optimista: al volver el Server Action la
// pagina se revalida y el porcentaje de adherencia se recalcula en el mismo
// render, asi que el numero nunca va un paso por detras de las casillas.
export function MealCheckToggle({
  planId,
  dayNum,
  mealTypeId,
  label,
  checked,
}: {
  planId: number;
  dayNum: number;
  mealTypeId: number;
  label: string;
  checked: boolean;
}) {
  return (
    <form action={toggleMealCheck}>
      <input type="hidden" name="plan_id" value={planId} />
      <input type="hidden" name="day_num" value={dayNum} />
      <input type="hidden" name="meal_type_id" value={mealTypeId} />
      <input type="hidden" name="checked" value={checked ? "1" : "0"} />
      <ToggleButton label={label} checked={checked} />
    </form>
  );
}

function ToggleButton({ label, checked }: { label: string; checked: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-pressed={checked}
      aria-label={checked ? `Mark ${label} as not done` : `Mark ${label} as done`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50",
        checked
          ? "text-brand hover:bg-brand-soft"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <span
        className={cn(
          "flex size-4 items-center justify-center rounded border",
          checked ? "border-brand bg-brand text-brand-foreground" : "border-input"
        )}
      >
        {checked && <Check className="size-3" />}
      </span>
      {checked ? "Done" : "Mark done"}
    </button>
  );
}
