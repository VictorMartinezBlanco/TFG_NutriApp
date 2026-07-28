import { adherenceVariant, type Adherence } from "@/lib/adherence";
import { Badge } from "@/components/ui/badge";

const BAR: Record<string, string> = {
  success: "bg-brand",
  warning: "bg-warning",
  critical: "bg-danger",
};

// Misma pieza en los dos paneles, alimentada por el mismo calculo, para que el
// cliente y su nutricionista no vean numeros distintos de lo mismo.
export function AdherenceBar({ adherence }: { adherence: Adherence }) {
  if (adherence.pct === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing to track yet. Your plan has not started.
      </p>
    );
  }

  const variant = adherenceVariant(adherence.pct);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold">{adherence.pct}%</span>
        <Badge variant={variant}>
          {adherence.checked} of {adherence.planned} meals
        </Badge>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${BAR[variant]}`}
          style={{ width: `${adherence.pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Over the first {adherence.daysCounted}{" "}
        {adherence.daysCounted === 1 ? "day" : "days"} of the plan.
      </p>
    </div>
  );
}
