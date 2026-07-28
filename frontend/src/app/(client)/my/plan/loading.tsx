import { Card } from "@/components/ui/card";

export default function MyPlanLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="h-7 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-56 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-5 w-48 animate-pulse rounded-full bg-muted" />
      </Card>
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i}>
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-4 flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="h-4 w-full animate-pulse rounded bg-muted" />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
