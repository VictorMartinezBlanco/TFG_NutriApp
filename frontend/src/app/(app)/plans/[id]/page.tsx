import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { requireNutritionist } from "@/lib/supabase/session";
import {
  planStatus,
  planStatusLabel,
  groupItemsByDay,
  aggregatePlanMacros,
  mealItemText,
  dayLabel,
  planDateRange,
  type MealItemRow,
} from "@/lib/plans";
import { MacroPanel } from "@/components/plan-macros";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Plan = {
  id: number;
  start_date: string;
  duration_days: number;
  approved_at: string | null;
  created_at: string;
  client: { id: number; full_name_pseudonym: string } | null;
};

export default async function PlanDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const planId = Number(params.id);
  if (!Number.isInteger(planId)) notFound();

  const { supabase } = await requireNutritionist();

  // la rls ya filtra por nutri: si el id no es suyo, single() no devuelve fila.
  const { data: plan } = await supabase
    .from("plan")
    .select(
      `id, start_date, duration_days, approved_at, created_at,
       client:client_id (id, full_name_pseudonym)`
    )
    .eq("id", planId)
    .is("deleted_at", null)
    .single<Plan>();

  if (!plan) notFound();

  const { data: rawItems } = await supabase
    .from("plan_meal_item")
    .select(
      `id, day_num, item_order, quantity_g, description_free,
       meal_type:meal_type_id (code, name_en, default_order),
       food:food_id (name_en, food_nutrient (value_per_100g, nutrient:nutrient_id (code)))`
    )
    .eq("plan_id", planId)
    .order("day_num", { ascending: true })
    .order("item_order", { ascending: true });

  const items = (rawItems as MealItemRow[] | null) ?? [];

  const status = planStatus(plan.approved_at);
  const days = groupItemsByDay(items);
  const macros = aggregatePlanMacros(items, plan.duration_days);
  const mealsPerDay = days.length ? days[0].meals.length : 0;
  const clientName = plan.client?.full_name_pseudonym ?? "Unknown client";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/plans"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to plans
        </Link>
      </div>

      <Card className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Meal plan for{" "}
            {plan.client ? (
              <Link
                href={`/clients/${plan.client.id}`}
                className="hover:text-brand"
              >
                {clientName}
              </Link>
            ) : (
              clientName
            )}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {planDateRange(plan.start_date, plan.duration_days)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant={status === "signed" ? "success" : "warning"}>
              {planStatusLabel(status)}
            </Badge>
            <Badge variant="neutral">{plan.duration_days} days</Badge>
            {mealsPerDay > 0 && (
              <Badge variant="neutral">{mealsPerDay} meals/day</Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled>
            <Pencil className="size-4" />
            Edit plan
          </Button>
          <Badge variant="info">Available soon</Badge>
        </div>
      </Card>

      {macros.countedItems > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Daily macros</CardTitle>
          </CardHeader>
          <MacroPanel macros={macros} />
        </Card>
      )}

      {days.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-muted-foreground">
            This plan has no meals yet.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {days.map((day) => (
            <Card key={day.dayNum}>
              <CardHeader>
                <CardTitle>
                  Day {day.dayNum}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {dayLabel(plan.start_date, day.dayNum)}
                  </span>
                </CardTitle>
              </CardHeader>
              <div className="flex flex-col divide-y divide-border">
                {day.meals.map((meal) => (
                  <div
                    key={meal.code}
                    className="grid gap-1 py-3 sm:grid-cols-[160px_1fr] sm:gap-4"
                  >
                    <div className="text-sm font-medium">{meal.label}</div>
                    <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                      {meal.items.map((item) => (
                        <li key={item.id}>{mealItemText(item)}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
