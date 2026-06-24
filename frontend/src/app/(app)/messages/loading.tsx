import { Card } from "@/components/ui/card";

export default function MessagesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="h-7 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-muted" />
      </div>
      <Card className="grid h-[70vh] grid-cols-1 overflow-hidden p-0 md:grid-cols-[20rem_1fr]">
        <div className="flex flex-col gap-4 border-r border-border p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="size-9 shrink-0 animate-pulse rounded-full bg-muted" />
              <div className="flex-1">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="mt-2 h-3 w-40 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden items-center justify-center md:flex">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        </div>
      </Card>
    </div>
  );
}
