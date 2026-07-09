import type { PlanMacros } from "@/lib/plans";

// Panel de macros del plan (media diaria). Los numeros se muestran sin comparar
// contra restricciones: eso es cosa del validador clinico.
export function MacroPanel({ macros }: { macros: PlanMacros }) {
  const cells = [
    { label: "Energy", value: `${macros.kcal} kcal` },
    { label: "Protein", value: `${macros.protein} g` },
    { label: "Carbs", value: `${macros.carb} g` },
    { label: "Fat", value: `${macros.fat} g` },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label} className="rounded-control bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="text-lg font-semibold">{c.value}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Daily average over {macros.days} days.
        {macros.skippedItems > 0 &&
          ` ${macros.skippedItems} item${macros.skippedItems === 1 ? "" : "s"} without nutrition data excluded.`}
      </p>
    </div>
  );
}
