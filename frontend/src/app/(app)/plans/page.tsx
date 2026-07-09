import Link from "next/link";
import { Search, Sparkles, Upload, Apple, ChevronRight } from "lucide-react";
import { requireNutritionist } from "@/lib/supabase/session";
import { monthYear } from "@/lib/format";
import {
  planStatus,
  planStatusLabel,
  aggregatePlanMacros,
  type MealItemRow,
  type PlanMacros,
} from "@/lib/plans";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

type PlanRow = {
  id: number;
  start_date: string;
  duration_days: number;
  approved_at: string | null;
  created_at: string;
  client: { id: number; full_name_pseudonym: string } | null;
};

const ITEM_SELECT =
  `day_num, quantity_g, description_free, ` +
  `food:food_id (name_en, food_nutrient (value_per_100g, nutrient:nutrient_id (code)))`;

export default async function PlansPage() {
  const { supabase } = await requireNutritionist();

  // la rls limita las filas al nutri logueado.
  const { data } = await supabase
    .from("plan")
    .select(
      `id, start_date, duration_days, approved_at, created_at,
       client:client_id (id, full_name_pseudonym)`
    )
    .is("deleted_at", null)
    .order("start_date", { ascending: false });

  const plans = (data as PlanRow[] | null) ?? [];

  // los macros se agregan plan a plan en consultas separadas en paralelo, no en
  // un embed unico: asi el limite de filas de postgrest nunca trunca un plan.
  const macrosByPlan = new Map<number, PlanMacros>();
  await Promise.all(
    plans.map(async (p) => {
      const { data: items } = await supabase
        .from("plan_meal_item")
        .select(ITEM_SELECT)
        .eq("plan_id", p.id);
      macrosByPlan.set(
        p.id,
        aggregatePlanMacros((items as MealItemRow[] | null) ?? [], p.duration_days)
      );
    })
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Plans</h1>
        <p className="text-sm text-muted-foreground">
          Generate new plans with AI, or upload your past plans to keep them in
          your library.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <CardHeader>
            <CardTitle>Generate plan with AI</CardTitle>
          </CardHeader>
          <p className="text-sm text-muted-foreground">
            Create a personalized weekly plan for a client from your style and
            their constraints.
          </p>
          <div className="mt-auto flex items-center gap-2">
            <Button disabled>
              <Sparkles className="size-4" />
              Generate
            </Button>
            <Badge variant="info">Available soon</Badge>
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <CardHeader>
            <CardTitle>Upload plan to database</CardTitle>
          </CardHeader>
          <p className="text-sm text-muted-foreground">
            Keep your past diet plans in your personal library, organized and
            easy to find.
          </p>
          <div className="mt-auto flex items-center gap-2">
            <Button variant="outline" disabled>
              <Upload className="size-4" />
              Upload
            </Button>
            <Badge variant="info">Available soon</Badge>
          </div>
        </Card>
      </div>

      <Link
        href="/foods"
        className="flex items-center justify-between gap-3 rounded-card border border-border bg-card p-4 shadow-card transition-colors hover:bg-muted/40"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-control bg-brand-soft text-brand">
            <Apple className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Browse food catalog</p>
            <p className="text-xs text-muted-foreground">
              Explore the shared food database and add your own custom foods.
            </p>
          </div>
        </div>
        <ChevronRight className="size-5 text-muted-foreground" />
      </Link>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Your plans</h2>

        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            disabled
            placeholder="Search plans (coming soon)"
            className="h-10 w-full rounded-control border border-border bg-card pl-9 pr-3 text-sm text-muted-foreground placeholder:text-muted-foreground"
          />
        </div>

        {plans.length === 0 ? (
          <Card>
            <p className="py-8 text-center text-sm text-muted-foreground">
              No plans yet. Plans will appear here once you start working with
              the AI copilot.
            </p>
          </Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Energy</th>
                  <th className="px-5 py-3 font-medium">Macros / day</th>
                  <th className="px-5 py-3 font-medium">Start</th>
                  <th className="px-5 py-3 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {plans.map((p) => {
                  const status = planStatus(p.approved_at);
                  const macros = macrosByPlan.get(p.id);
                  const shown = macros && macros.countedItems > 0 ? macros : null;
                  return (
                    <tr key={p.id} className="hover:bg-muted/40">
                      <td className="px-5 py-3">
                        <Link
                          href={`/plans/${p.id}`}
                          className="font-medium hover:text-brand"
                        >
                          {p.client?.full_name_pseudonym ?? "Unknown client"}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={status === "signed" ? "success" : "warning"}>
                          {planStatusLabel(status)}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 font-medium">
                        {shown ? `${shown.kcal} kcal` : "-"}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {shown
                          ? `P ${shown.protein} · C ${shown.carb} · F ${shown.fat} g`
                          : "-"}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {monthYear(p.start_date)}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {p.duration_days} days
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
