import Link from "next/link";
import { Search, Plus } from "lucide-react";
import { requireNutritionist } from "@/lib/supabase/session";
import {
  isCustom,
  valueByCode,
  formatAmount,
  type FoodRow,
} from "@/lib/foods";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const SELECT =
  "id, name_es, name_en, typical_serving_g, nutritionist_id, created_at, " +
  "food_nutrient (value_per_100g, nutrient:nutrient_id (code))";

export default async function FoodsPage({
  searchParams,
}: {
  searchParams: { q?: string; mine?: string };
}) {
  const { supabase, user } = await requireNutritionist();

  const q = searchParams.q?.trim() ?? "";
  const mine = searchParams.mine === "1";

  // la rls deja ver los publicos (nutritionist_id null) y los propios.
  let query = supabase
    .from("food")
    .select(SELECT)
    .is("deleted_at", null)
    .order("name_en", { ascending: true });

  if (q) {
    const pattern = `%${q}%`;
    query = query.or(`name_en.ilike.${pattern},name_es.ilike.${pattern}`);
  }
  if (mine) {
    query = query.eq("nutritionist_id", user.id);
  }

  const { data } = await query;
  const foods = (data as FoodRow[] | null) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Food catalog</h1>
          <p className="text-sm text-muted-foreground">
            Browse the shared food database and your own custom foods.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/foods/new">
            <Plus className="size-4" />
            Add custom food
          </Link>
        </Button>
      </div>

      <form method="GET" action="/foods" className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by name"
            className="h-10 w-full rounded-control border border-input bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            name="mine"
            value="1"
            defaultChecked={mine}
            className="size-4 rounded border-input accent-brand"
          />
          Only my custom foods
        </label>
        <Button type="submit" variant="outline" size="sm">
          Search
        </Button>
        {(q || mine) && (
          <Link
            href="/foods"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Clear
          </Link>
        )}
      </form>

      {foods.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-muted-foreground">
            {q || mine
              ? "No foods match your search."
              : "No foods in the catalog yet."}
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-medium">Food</th>
                <th className="px-5 py-3 font-medium">Energy</th>
                <th className="px-5 py-3 font-medium">Protein</th>
                <th className="px-5 py-3 font-medium">Carbs</th>
                <th className="px-5 py-3 font-medium">Fat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {foods.map((food) => {
                const energy = valueByCode(food.food_nutrient, "energy_kcal");
                const protein = valueByCode(food.food_nutrient, "protein_g");
                const carb = valueByCode(food.food_nutrient, "carb_g");
                const fat = valueByCode(food.food_nutrient, "fat_g");
                return (
                  <tr key={food.id} className="hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <Link
                        href={`/foods/${food.id}`}
                        className="flex flex-wrap items-center gap-2 font-medium hover:text-brand"
                      >
                        {food.name_en}
                        {isCustom(food) && (
                          <Badge variant="info">Custom</Badge>
                        )}
                      </Link>
                    </td>
                    <Macro value={energy} suffix=" kcal" />
                    <Macro value={protein} suffix=" g" />
                    <Macro value={carb} suffix=" g" />
                    <Macro value={fat} suffix=" g" />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        All values are shown per 100 g.
      </p>
    </div>
  );
}

function Macro({ value, suffix }: { value: number | null; suffix: string }) {
  return (
    <td className="px-5 py-3 text-muted-foreground">
      {value != null ? `${formatAmount(value)}${suffix}` : "-"}
    </td>
  );
}
