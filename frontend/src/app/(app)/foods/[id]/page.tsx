import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil, Trash2 } from "lucide-react";
import { requireNutritionist } from "@/lib/supabase/session";
import { monthYear } from "@/lib/format";
import {
  isCustom,
  nutrientMap,
  formatNutrient,
  formatAmount,
  tagGroup,
  CORE_MACRO_CODES,
  EXTRA_MACRO_CODES,
  TAG_GROUP_ORDER,
  type FoodDetail,
} from "@/lib/foods";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const SELECT =
  "id, name_es, name_en, typical_serving_g, nutritionist_id, created_at, " +
  "food_nutrient (value_per_100g, nutrient:nutrient_id (code, name_en, unit_default, kind)), " +
  "food_tag (tag:tag_id (code, name_en, kind))";

export default async function FoodDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const foodId = Number(params.id);
  if (!Number.isInteger(foodId)) notFound();

  const { supabase } = await requireNutritionist();

  // la rls deja ver publicos y propios; un id ajeno no devuelve fila.
  const { data: food } = await supabase
    .from("food")
    .select(SELECT)
    .eq("id", foodId)
    .is("deleted_at", null)
    .single<FoodDetail>();

  if (!food) notFound();

  const byCode = nutrientMap(food.food_nutrient);
  const custom = isCustom(food);

  const coreMacros = CORE_MACRO_CODES.map((code) => byCode.get(code)).filter(
    (row): row is NonNullable<typeof row> => Boolean(row)
  );
  const extraMacros = EXTRA_MACRO_CODES.map((code) => byCode.get(code)).filter(
    (row): row is NonNullable<typeof row> => Boolean(row)
  );

  // micros = lo que no es macro ni energia (minerales, vitaminas, etc).
  const macroCodes = new Set<string>([...CORE_MACRO_CODES, ...EXTRA_MACRO_CODES]);
  const micros = food.food_nutrient
    .filter((row) => row.nutrient && !macroCodes.has(row.nutrient.code))
    .sort((a, b) =>
      (a.nutrient?.name_en ?? "").localeCompare(b.nutrient?.name_en ?? "")
    );

  const energy = byCode.get("energy_kcal");
  const tagGroups = groupTags(food.food_tag);

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

      <Card className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{food.name_en}</h1>
            {custom && <Badge variant="info">Custom</Badge>}
          </div>
          {food.name_es && food.name_es !== food.name_en && (
            <p className="text-sm text-muted-foreground">{food.name_es}</p>
          )}
          <p className="mt-2 text-sm">
            {energy ? (
              <>
                <span className="text-xl font-semibold">
                  {formatAmount(energy.value_per_100g)}
                </span>{" "}
                <span className="text-muted-foreground">kcal per 100 g</span>
              </>
            ) : (
              <span className="text-muted-foreground">No energy data</span>
            )}
          </p>
        </div>

        {custom && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              <Pencil className="size-4" />
              Edit
            </Button>
            <Button variant="ghost" size="sm" disabled>
              <Trash2 className="size-4" />
              Delete
            </Button>
            <Badge variant="info">Available soon</Badge>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Macros (per 100 g)</CardTitle>
          </CardHeader>
          {coreMacros.length === 0 && extraMacros.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No macronutrient data available yet for this food.
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              {[...coreMacros, ...extraMacros].map((row) => (
                <NutrientLine key={row.nutrient!.code} row={row} />
              ))}
            </dl>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Micronutrients (per 100 g)</CardTitle>
          </CardHeader>
          {micros.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No micronutrient data available yet for this food.
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              {micros.map((row) => (
                <NutrientLine key={row.nutrient!.code} row={row} />
              ))}
            </dl>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tags</CardTitle>
        </CardHeader>
        {tagGroups.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No tags assigned to this food.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {tagGroups.map(({ group, items }) => (
              <div key={group}>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {items.map((name) => (
                    <Badge key={name} variant="neutral">
                      {name}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        Added to the catalog in {monthYear(food.created_at)}.
      </p>
    </div>
  );
}

function NutrientLine({
  row,
}: {
  row: { value_per_100g: number; nutrient: { name_en: string; unit_default: string } | null };
}) {
  if (!row.nutrient) return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{row.nutrient.name_en}</dt>
      <dd className="font-medium">
        {formatNutrient(row.value_per_100g, row.nutrient.unit_default)}
      </dd>
    </div>
  );
}

function groupTags(rows: FoodDetail["food_tag"]) {
  const byGroup = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.tag) continue;
    const g = tagGroup(row.tag.kind);
    const list = byGroup.get(g) ?? [];
    list.push(row.tag.name_en);
    byGroup.set(g, list);
  }
  return TAG_GROUP_ORDER.filter((g) => byGroup.has(g)).map((group) => ({
    group,
    items: byGroup.get(group)!.sort((a, b) => a.localeCompare(b)),
  }));
}
