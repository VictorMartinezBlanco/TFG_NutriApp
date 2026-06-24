import { Card } from "@/components/ui/card";

export default function FoodsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="h-7 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-80 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-10 w-full max-w-md animate-pulse rounded-control bg-muted" />
      <Card className="p-0">
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-4">
              <div className="h-4 w-48 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
