import { Card } from "@/components/ui/card";

export default function ClientDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-4 w-28 animate-pulse rounded bg-muted" />
      <Card className="flex items-center gap-4">
        <div className="size-14 animate-pulse rounded-full bg-muted" />
        <div className="flex flex-col gap-2">
          <div className="h-6 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        </div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="h-40 animate-pulse" />
        <Card className="h-40 animate-pulse" />
      </div>
      <Card className="h-48 animate-pulse" />
    </div>
  );
}
