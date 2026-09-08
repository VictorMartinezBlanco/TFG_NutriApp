import Link from "next/link";
import { Plus } from "lucide-react";
import { requireNutritionist } from "@/lib/supabase/session";
import { Button } from "@/components/ui/button";
import { ClientsTable, type ClientRow } from "./clients-table";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const { supabase } = await requireNutritionist();

  // la rls limita las filas al nutri logueado.
  const { data } = await supabase
    .from("client")
    .select(
      "id, full_name_pseudonym, sex, birth_date, activity_level, created_at"
    )
    .is("deleted_at", null)
    .order("full_name_pseudonym", { ascending: true });

  const clients = (data as ClientRow[] | null) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Your client roster and their key data.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/clients/new">
            <Plus className="size-4" />
            Add client
          </Link>
        </Button>
      </div>

      <ClientsTable clients={clients} />
    </div>
  );
}
