import { Card } from "@/components/ui/card";

export default function ClientDashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="h-7 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-56 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card>
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-4 flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-4 w-full animate-pulse rounded bg-muted" />
            ))}
          </div>
        </Card>
        <div className="flex flex-col gap-5">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <div className="h-5 w-32 animate-pulse rounded bg-muted" />
              <div className="mt-4 h-4 w-full animate-pulse rounded bg-muted" />
              <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-muted" />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
