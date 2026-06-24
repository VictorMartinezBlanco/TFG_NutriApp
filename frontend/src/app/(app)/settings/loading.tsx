import { Card } from "@/components/ui/card";

export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="h-7 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-80 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex gap-6 border-b border-border pb-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-4 w-24 animate-pulse rounded bg-muted" />
        ))}
      </div>
      <Card>
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 w-full max-w-md animate-pulse rounded-control bg-muted" />
          ))}
        </div>
      </Card>
    </div>
  );
}
