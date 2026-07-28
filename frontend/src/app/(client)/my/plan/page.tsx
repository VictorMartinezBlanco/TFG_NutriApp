import { requireClient } from "@/lib/supabase/session";
import {
  groupItemsByDay,
  aggregatePlanMacros,
  mealItemText,
  dayLabel,
  planDateRange,
  planDayNumFor,
  pickActivePlan,
  type MealItemRow,
} from "@/lib/plans";
import { MacroPanel } from "@/components/plan-macros";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ClientPlan = {
  id: number;
  start_date: string;
  duration_days: number;
  approved_at: string | null;
};

export default async function MyPlanPage() {
  const { supabase } = await requireClient();

  // la rls solo deja pasar los planes propios y firmados: un borrador del
  // nutricionista no llega hasta aqui.
  const { data: plans } = await supabase
    .from("plan")
    .select("id, start_date, duration_days, approved_at")
    .order("start_date", { ascending: false });

  const plan = pickActivePlan((plans as ClientPlan[] | null) ?? [], new Date());

  if (!plan) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">My plan</h1>
        <Card>
          <p className="py-8 text-center text-sm text-muted-foreground">
            Your nutritionist has not shared a plan with you yet. It will show up
            here once they sign it.
          </p>
        </Card>
      </div>
    );
  }

  const { data: rawItems } = await supabase
    .from("plan_meal_item")
    .select(
      `id, day_num, item_order, quantity_g, description_free,
       meal_type:meal_type_id (code, name_en, default_order),
       food:food_id (name_en, food_nutrient (value_per_100g, nutrient:nutrient_id (code)))`
    )
    .eq("plan_id", plan.id)
    .order("day_num", { ascending: true })
    .order("item_order", { ascending: true });

  const items = (rawItems as MealItemRow[] | null) ?? [];
  const days = groupItemsByDay(items);
  const macros = aggregatePlanMacros(items, plan.duration_days);
  const today = planDayNumFor(plan.start_date, plan.duration_days, new Date());

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h1 className="text-2xl font-bold">My plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {planDateRange(plan.start_date, plan.duration_days)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{plan.duration_days} days</Badge>
          {days.length > 0 && (
            <Badge variant="neutral">{days[0].meals.length} meals/day</Badge>
          )}
          {today !== null && <Badge variant="success">Day {today} today</Badge>}
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
                  {day.dayNum === today && (
                    <Badge variant="success" className="ml-2">
                      Today
                    </Badge>
                  )}
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
