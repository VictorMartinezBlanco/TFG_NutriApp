import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function FoodNotFound() {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
      <div>
        <h1 className="text-xl font-bold">Food not found</h1>
        <p className="text-sm text-muted-foreground">
          This food does not exist or is not available to you.
        </p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link href="/foods">Back to food catalog</Link>
      </Button>
    </div>
  );
}
