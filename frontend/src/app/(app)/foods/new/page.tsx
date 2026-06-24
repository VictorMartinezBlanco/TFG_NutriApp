import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireNutritionist } from "@/lib/supabase/session";
import { tagGroup, TAG_GROUP_ORDER } from "@/lib/foods";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { NewFoodForm, type TagOption } from "./new-food-form";

export const dynamic = "force-dynamic";

type TagRow = { id: number; name_en: string; kind: string };

export default async function NewFoodPage() {
  const { supabase } = await requireNutritionist();

  const { data } = await supabase
    .from("tag")
    .select("id, name_en, kind")
    .order("name_en", { ascending: true });

  const tags = (data as TagRow[] | null) ?? [];

  // Agrupa las tags por su kind para mostrarlas ordenadas en el form.
  const grouped: { group: string; options: TagOption[] }[] = [];
  const byGroup = new Map<string, TagOption[]>();
  for (const t of tags) {
    const g = tagGroup(t.kind);
    const list = byGroup.get(g) ?? [];
    list.push({ id: t.id, name: t.name_en });
    byGroup.set(g, list);
  }
  for (const group of TAG_GROUP_ORDER) {
    if (byGroup.has(group)) grouped.push({ group, options: byGroup.get(group)! });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/foods"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to food catalog
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Add custom food</h1>
        <p className="text-sm text-muted-foreground">
          Create a food in your personal catalog. All values are per 100 g.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Food details</CardTitle>
        </CardHeader>
        <NewFoodForm tagGroups={grouped} />
      </Card>
    </div>
  );
}
