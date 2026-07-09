import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireNutritionist } from "@/lib/supabase/session";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { NewClientForm } from "./new-client-form";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  await requireNutritionist();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/clients"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to clients
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Add client</h1>
        <p className="text-sm text-muted-foreground">
          Create a client profile. Only the name is required; you can fill in the
          rest later.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Client details</CardTitle>
        </CardHeader>
        <NewClientForm />
      </Card>
    </div>
  );
}
