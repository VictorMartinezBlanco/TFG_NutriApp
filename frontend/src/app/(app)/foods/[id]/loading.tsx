import { Card } from "@/components/ui/card";

export default function FoodDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <Card>
        <div className="h-7 w-56 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-32 animate-pulse rounded bg-muted" />
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-48 animate-pulse rounded-card bg-muted" />
        <div className="h-48 animate-pulse rounded-card bg-muted" />
      </div>
      <div className="h-32 animate-pulse rounded-card bg-muted" />
    </div>
  );
}
