import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ClientNotFound() {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
      <div>
        <h1 className="text-xl font-bold">Client not found</h1>
        <p className="text-sm text-muted-foreground">
          This client does not exist or is not in your roster.
        </p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link href="/clients">Back to clients</Link>
      </Button>
    </div>
  );
}
