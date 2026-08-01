import Link from "next/link";
import { CalendarClock, MessageSquare, TrendingUp, Scale } from "lucide-react";
import { requireClient } from "@/lib/supabase/session";
import { firstName } from "@/lib/format";
import {
  formatAppointmentWhen,
  appointmentStatusLabel,
  appointmentStatusVariant,
} from "@/lib/appointments";
import { messageTime } from "@/lib/messages";
import { computeAdherence, type MealCheckRow } from "@/lib/adherence";
import {
  groupItemsByDay,
  mealItemText,
  planDayNumFor,
  planDaysElapsed,
  pickActivePlan,
  dayLabel,
  type MealItemRow,
} from "@/lib/plans";
import { AdherenceBar } from "@/components/adherence-bar";
import { WeightSparkline, WeightLog, type WeightPoint } from "@/components/weight-series";
import { MealCheckToggle } from "../meal-check-toggle";
import { WeightForm } from "../weight-form";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ClientPlan = {
  id: number;
  start_date: string;
  duration_days: number;
};

type NextAppointment = {
  id: number;
  scheduled_at: string;
  duration_min: number;
  status: string;
};

type LastMessage = {
  id: number;
  sender: "nutritionist" | "client";
  body: string;
  created_at: string;
};

export default async function ClientDashboardPage() {
  const { supabase, client } = await requireClient();
  const now = new Date();

  const [plansRes, appointmentRes, messageRes, nutriRes, weightRes] =
    await Promise.all([
      supabase
        .from("plan")
        .select("id, start_date, duration_days")
        .order("start_date", { ascending: false }),
      supabase
        .from("appointment")
        .select("id, scheduled_at, duration_min, status")
        .in("status", ["pending", "scheduled"])
        .is("deleted_at", null)
        .gte("scheduled_at", now.toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(1),
      supabase
        .from("message")
        .select("id, sender, body, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1),
      supabase.from("nutritionist").select("full_name").limit(1),
      supabase
        .from("weight_entry")
        .select("measured_on, weight_kg")
        .order("measured_on", { ascending: false })
        .limit(12),
    ]);

  const plan = pickActivePlan((plansRes.data as ClientPlan[] | null) ?? [], now);
  const nextAppointment = ((appointmentRes.data as NextAppointment[] | null) ??
    [])[0];
  const lastMessage = ((messageRes.data as LastMessage[] | null) ?? [])[0];
  const nutritionistName =
    (nutriRes.data as { full_name: string }[] | null)?.[0]?.full_name ??
    "your nutritionist";
  const weights = (weightRes.data as WeightPoint[] | null) ?? [];

  const today = new Date().toISOString().slice(0, 10);
  const todayWeight = weights.find((w) => w.measured_on === today);

  const todayNum = plan
    ? planDayNumFor(plan.start_date, plan.duration_days, now)
    : null;

  // Las comidas de hoy con su marca, y en paralelo lo que hace falta para la
  // adherencia: las comidas planificadas de todo el plan y todas las marcas.
  let todayMeals: ReturnType<typeof groupItemsByDay>[number] | undefined;
  let checkedToday = new Set<number>();
  let adherence = computeAdherence([], [], 0);

  if (plan) {
    const [todayItemsRes, plannedRes, checksRes] = await Promise.all([
      todayNum === null
        ? Promise.resolve({ data: null })
        : supabase
            .from("plan_meal_item")
            .select(
              `id, day_num, item_order, quantity_g, description_free,
               meal_type:meal_type_id (id, code, name_en, default_order),
               food:food_id (name_en, grams_per_unit)`
            )
            .eq("plan_id", plan.id)
            .eq("day_num", todayNum)
            .order("item_order", { ascending: true }),
      supabase
        .from("plan_meal_item")
        .select("day_num, meal_type_id")
        .eq("plan_id", plan.id),
      supabase
        .from("meal_check")
        .select("day_num, meal_type_id")
        .eq("plan_id", plan.id),
    ]);

    const checks = (checksRes.data as MealCheckRow[] | null) ?? [];
    adherence = computeAdherence(
      (plannedRes.data as { day_num: number; meal_type_id: number }[] | null) ?? [],
      checks,
      planDaysElapsed(plan.start_date, plan.duration_days, now)
    );

    if (todayNum !== null) {
      todayMeals = groupItemsByDay(
        (todayItemsRes.data as MealItemRow[] | null) ?? []
      )[0];
      checkedToday = new Set(
        checks.filter((c) => c.day_num === todayNum).map((c) => c.meal_type_id)
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Hi, {firstName(client.fullName)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here is your plan for today.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s meals</CardTitle>
              {plan && todayNum !== null && (
                <span className="text-sm text-muted-foreground">
                  Day {todayNum} of {plan.duration_days}
                </span>
              )}
            </CardHeader>

            {!plan ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Your nutritionist has not shared a plan with you yet.
              </p>
            ) : todayNum === null ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <p>Your current plan does not cover today.</p>
                <Link href="/my/plan" className="mt-2 inline-block text-brand">
                  See the full plan
                </Link>
              </div>
            ) : !todayMeals ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No meals were planned for today.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {todayMeals.meals.map((meal) => {
                  const mealTypeId = meal.mealTypeId;
                  return (
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
                      {mealTypeId != null && (
                        <MealCheckToggle
                          planId={plan.id}
                          dayNum={todayNum}
                          mealTypeId={mealTypeId}
                          label={meal.label}
                          checked={checkedToday.has(mealTypeId)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {plan && (
              <p className="mt-4 text-xs text-muted-foreground">
                {dayLabel(plan.start_date, todayNum ?? 1)} ·{" "}
                <Link href="/my/plan" className="text-brand">
                  See the full plan
                </Link>
              </p>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Plan adherence</CardTitle>
              <TrendingUp className="size-4 text-muted-foreground" />
            </CardHeader>
            {plan ? (
              <AdherenceBar adherence={adherence} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Adherence starts counting once you have a plan.
              </p>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Weight</CardTitle>
              <Scale className="size-4 text-muted-foreground" />
            </CardHeader>
            <div className="flex flex-col gap-3">
              <WeightSparkline points={weights} />
              <WeightLog points={weights} limit={4} />
              <WeightForm
                todayValue={todayWeight ? Number(todayWeight.weight_kg) : null}
              />
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Next appointment</CardTitle>
              <CalendarClock className="size-4 text-muted-foreground" />
            </CardHeader>
            {nextAppointment ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">
                  {formatAppointmentWhen(
                    nextAppointment.scheduled_at,
                    nextAppointment.duration_min
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  With {nutritionistName}
                </p>
                <Badge
                  variant={appointmentStatusVariant(
                    nextAppointment.status,
                    nextAppointment.scheduled_at,
                    now
                  )}
                  className="w-fit"
                >
                  {appointmentStatusLabel(
                    nextAppointment.status,
                    nextAppointment.scheduled_at,
                    now
                  )}
                </Badge>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  No appointment scheduled.
                </p>
                <Link href="/my/appointments" className="text-sm text-brand">
                  Request one
                </Link>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Messages</CardTitle>
              <MessageSquare className="size-4 text-muted-foreground" />
            </CardHeader>
            <p className="-mt-2 mb-3 text-xs text-muted-foreground">
              Conversation with {nutritionistName}
            </p>
            {lastMessage ? (
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">
                  {lastMessage.sender === "nutritionist"
                    ? nutritionistName
                    : "You"}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {messageTime(lastMessage.created_at)}
                  </span>
                </p>
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {lastMessage.body}
                </p>
                <Link href="/my/messages" className="mt-1 text-sm text-brand">
                  Open conversation
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No messages yet.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
