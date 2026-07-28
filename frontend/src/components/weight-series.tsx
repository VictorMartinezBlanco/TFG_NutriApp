export type WeightPoint = { measured_on: string; weight_kg: number | string };

type Point = { day: string; kg: number };

function normalize(points: WeightPoint[]): Point[] {
  return points
    .map((p) => ({ day: p.measured_on, kg: Number(p.weight_kg) }))
    .filter((p) => Number.isFinite(p.kg))
    .sort((a, b) => a.day.localeCompare(b.day));
}

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function signed(delta: number): string {
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
}

// Grafica sin dependencias: una polilinea sobre un viewBox que se estira al
// ancho disponible. El stroke se declara no escalable para que estirarlo no
// engorde la linea.
export function WeightSparkline({ points }: { points: WeightPoint[] }) {
  const data = normalize(points);
  if (data.length < 2) return null;

  const values = data.map((p) => p.kg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const coords = data.map((p, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 30 - ((p.kg - min) / span) * 26;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <div className="flex flex-col gap-1">
      <svg
        viewBox="0 0 100 32"
        preserveAspectRatio="none"
        className="h-16 w-full"
        role="img"
        aria-label={`Weight from ${min.toFixed(1)} to ${max.toFixed(1)} kg`}
      >
        <polyline
          points={coords.join(" ")}
          fill="none"
          stroke="hsl(var(--brand))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{dayLabel(data[0].day)}</span>
        <span>{dayLabel(data[data.length - 1].day)}</span>
      </div>
    </div>
  );
}

// Los ultimos registros con su variacion respecto al anterior. Mas reciente
// arriba, que es como se lee.
export function WeightLog({
  points,
  limit = 5,
}: {
  points: WeightPoint[];
  limit?: number;
}) {
  const data = normalize(points);
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No weight logged yet.</p>
    );
  }

  const rows = data
    .map((p, i) => ({ ...p, delta: i > 0 ? p.kg - data[i - 1].kg : null }))
    .reverse()
    .slice(0, limit);

  return (
    <ul className="flex flex-col divide-y divide-border text-sm">
      {rows.map((row) => (
        <li key={row.day} className="flex items-center justify-between py-2">
          <span className="text-muted-foreground">{dayLabel(row.day)}</span>
          <span className="flex items-center gap-2">
            <span className="font-medium">{row.kg.toFixed(1)} kg</span>
            {row.delta !== null && row.delta !== 0 && (
              <span className="text-xs text-muted-foreground">
                {signed(row.delta)}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
