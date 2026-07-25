import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireNutritionist } from "@/lib/supabase/session";
import { loadConstraintCatalog } from "@/lib/constraint-catalog";
import { Card } from "@/components/ui/card";
import { ConstraintForm } from "../../../clients/[id]/constraints/constraint-form";
import { createNutritionistConstraint } from "../_actions";

export default async function NewClinicalRulePage() {
  const { supabase } = await requireNutritionist();
  const catalog = await loadConstraintCatalog(supabase);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <Link
          href="/settings?tab=clinical"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to my clinical style
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Add a rule to my style</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A rule you follow with every client. It applies to every plan you
          generate, on top of each client&apos;s own rules.
        </p>
      </div>

      <Card>
        <ConstraintForm
          action={createNutritionistConstraint}
          scopeField={null}
          cancelHref="/settings?tab=clinical"
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
