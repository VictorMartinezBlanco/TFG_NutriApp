import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireNutritionist } from "@/lib/supabase/session";
import { loadConstraintCatalog } from "@/lib/constraint-catalog";
import { Card } from "@/components/ui/card";
import { ConstraintForm } from "../constraint-form";
import { createClientConstraint } from "../_actions";

type ClientRow = { id: number; full_name_pseudonym: string };

export default async function NewConstraintPage({
  params,
}: {
  params: { id: string };
}) {
  const clientId = Number(params.id);
  if (!Number.isInteger(clientId)) notFound();

  const { supabase } = await requireNutritionist();

  const { data: client } = await supabase
    .from("client")
    .select("id, full_name_pseudonym")
    .eq("id", clientId)
    .is("deleted_at", null)
    .single<ClientRow>();

  if (!client) notFound();

  const catalog = await loadConstraintCatalog(supabase);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <Link
          href={`/clients/${client.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to {client.full_name_pseudonym}
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Add a rule</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A dietary rule for {client.full_name_pseudonym} that the plan generator
          will respect.
        </p>
      </div>

      <Card>
        <ConstraintForm
          action={createClientConstraint}
          scopeField={<input type="hidden" name="client_id" value={client.id} />}
          cancelHref={`/clients/${client.id}`}
          tagGroups={catalog.tagGroups}
          nutrients={catalog.nutrients}
          macros={catalog.macros}
          units={catalog.units}
          mealSplit={catalog.mealSplit}
        />
      </Card>
    </div>
  );
}
