import { requireClient } from "@/lib/supabase/session";
import {
  groupItemsByDay,
  aggregatePlanMacros,
  mealItemText,
  dayLabel,
  planDateRange,
  planDayNumFor,
  planDaysElapsed,
  pickActivePlan,
  type MealItemRow,
} from "@/lib/plans";
import { computeAdherence, mealKey, type MealCheckRow } from "@/lib/adherence";
import { MacroPanel } from "@/components/plan-macros";
import { AdherenceBar } from "@/components/adherence-bar";
import { MealCheckToggle } from "../meal-check-toggle";
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
  const now = new Date();

  // la rls solo deja pasar los planes propios y firmados: un borrador del
  // nutricionista no llega hasta aqui.
  const { data: plans } = await supabase
    .from("plan")
    .select("id, start_date, duration_days, approved_at")
    .order("start_date", { ascending: false });

  const plan = pickActivePlan((plans as ClientPlan[] | null) ?? [], now);

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

  const [{ data: rawItems }, { data: rawChecks }] = await Promise.all([
    supabase
      .from("plan_meal_item")
      .select(
        `id, day_num, item_order, quantity_g, description_free,
         meal_type:meal_type_id (id, code, name_en, default_order),
         food:food_id (name_en, food_nutrient (value_per_100g, nutrient:nutrient_id (code)))`
      )
      .eq("plan_id", plan.id)
      .order("day_num", { ascending: true })
      .order("item_order", { ascending: true }),
    supabase
      .from("meal_check")
      .select("day_num, meal_type_id")
      .eq("plan_id", plan.id),
  ]);

  const items = (rawItems as MealItemRow[] | null) ?? [];
  const checks = (rawChecks as MealCheckRow[] | null) ?? [];
  const days = groupItemsByDay(items);
  const macros = aggregatePlanMacros(items, plan.duration_days);
  const today = planDayNumFor(plan.start_date, plan.duration_days, now);

  // Hasta que dia se puede marcar. Es el mismo corte que usa la policy, asi que
  // la pantalla no ofrece nada que la base de datos vaya a rechazar.
  const elapsed = planDaysElapsed(plan.start_date, plan.duration_days, now);
  const checkedKeys = new Set(
    checks.map((c) => mealKey(c.day_num, c.meal_type_id))
  );
  const adherence = computeAdherence(
    items.map((i) => ({
      day_num: i.day_num,
      meal_type_id: i.meal_type?.id ?? 0,
    })),
    checks,
    elapsed
  );

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

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Plan adherence</CardTitle>
          </CardHeader>
          <AdherenceBar adherence={adherence} />
        </Card>

        {macros.countedItems > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Daily macros</CardTitle>
            </CardHeader>
            <MacroPanel macros={macros} />
          </Card>
        )}
      </div>

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
                {day.dayNum > elapsed && (
                  <span className="text-xs text-muted-foreground">
                    Not yet
                  </span>
                )}
              </CardHeader>
              <div className="flex flex-col divide-y divide-border">
                {day.meals.map((meal) => (
                  <div
                    key={meal.code}
                    className="grid gap-1 py-3 sm:grid-cols-[160px_1fr_auto] sm:gap-4"
                  >
                    <div className="text-sm font-medium">{meal.label}</div>
                    <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                      {meal.items.map((item) => (
                        <li key={item.id}>{mealItemText(item)}</li>
                      ))}
                    </ul>
                    {meal.mealTypeId != null && day.dayNum <= elapsed && (
                      <MealCheckToggle
                        planId={plan.id}
                        dayNum={day.dayNum}
                        mealTypeId={meal.mealTypeId}
                        label={`${meal.label} on day ${day.dayNum}`}
                        checked={checkedKeys.has(
                          mealKey(day.dayNum, meal.mealTypeId)
                        )}
                      />
                    )}
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
