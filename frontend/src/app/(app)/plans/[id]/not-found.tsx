import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PlanNotFound() {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
      <div>
        <h1 className="text-xl font-bold">Plan not found</h1>
        <p className="text-sm text-muted-foreground">
          This plan does not exist or does not belong to you.
        </p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link href="/plans">Back to plans</Link>
      </Button>
    </div>
  );
}
