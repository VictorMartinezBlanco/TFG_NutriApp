import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MessageSquare, CalendarDays, Plus } from "lucide-react";
import { requireNutritionist } from "@/lib/supabase/session";
import {
  initials,
  ageFromBirthDate,
  sexLabel,
  activityLabel,
  monthYear,
} from "@/lib/format";
import {
  constraintLabel,
  constraintGroup,
  priorityLabel,
  type ConstraintRow,
} from "@/lib/constraints";
import { aggregatePlanMacros, type MealItemRow } from "@/lib/plans";
import {
  formatAppointmentWhen,
  splitUpcomingPast,
  type AppointmentRow,
} from "@/lib/appointments";
import { MacroPanel } from "@/components/plan-macros";
import { NewAppointmentDialog } from "../../calendar/new-appointment-dialog";
import { DeleteConstraintButton } from "./constraints/delete-constraint-button";
import { GeneratePlanButton } from "./generate-plan-button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type Client = {
  id: number;
  full_name_pseudonym: string;
  sex: string | null;
  birth_date: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: string | null;
  created_at: string;
};

type Plan = {
  id: number;
  start_date: string;
  duration_days: number;
  approved_at: string | null;
  plan_meal_item: MealItemRow[];
};

export default async function ClientDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const clientId = Number(params.id);
  if (!Number.isInteger(clientId)) notFound();

  const { supabase } = await requireNutritionist();

  // la rls ya filtra por nutri: si el id no es suyo, single() no devuelve fila.
  const { data: client } = await supabase
    .from("client")
    .select(
      "id, full_name_pseudonym, sex, birth_date, height_cm, weight_kg, activity_level, created_at"
    )
    .eq("id", clientId)
    .is("deleted_at", null)
    .single<Client>();

  if (!client) notFound();

  const [{ data: rawConstraints }, { data: plan }, { data: appointmentRows }] =
    await Promise.all([
      supabase
        .from("diet_constraint")
        .select(
          `id, type, operator, value, value2, priority, weight, context,
           tag:target_tag_id (name_en, kind),
           food:target_food_id (name_en),
           nutrient:target_nutrient_id (name_en, unit_default)`
        )
        .eq("scope_type", "client")
        .eq("scope_client_id", clientId)
        .is("deleted_at", null)
        .order("priority", { ascending: true })
        .order("weight", { ascending: false }),
      supabase
        .from("plan")
        .select(
          `id, start_date, duration_days, approved_at,
           plan_meal_item (day_num, quantity_g, description_free,
             food:food_id (name_en, food_nutrient (value_per_100g, nutrient:nutrient_id (code))))`
        )
        .eq("client_id", clientId)
        .is("deleted_at", null)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle<Plan>(),
      supabase
        .from("appointment")
        .select("id, scheduled_at, duration_min, status, notes, client:client_id (id, full_name_pseudonym)")
        .eq("client_id", clientId)
        .neq("status", "cancelled")
        .is("deleted_at", null)
        .order("scheduled_at", { ascending: true }),
    ]);

  const constraints = (rawConstraints as ConstraintRow[] | null) ?? [];
  const planMacros = plan
    ? aggregatePlanMacros(plan.plan_meal_item ?? [], plan.duration_days)
    : null;

  // proxima cita por hora de fin (una cita en curso sigue siendo la proxima),
  // mismo criterio que el calendario y el dashboard.
  const nextAppointment = splitUpcomingPast(
    (appointmentRows as AppointmentRow[] | null) ?? [],
    new Date()
  ).upcoming[0];

  const age = ageFromBirthDate(client.birth_date);
  const demographics = [
    age != null ? `${age} years` : null,
    sexLabel(client.sex),
    client.height_cm ? `${client.height_cm} cm` : null,
    client.weight_kg ? `${client.weight_kg} kg` : null,
  ].filter(Boolean);

  const groups = groupConstraints(constraints);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/clients"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to clients
        </Link>
      </div>

      <Card className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="size-14 text-base">
            <AvatarFallback>
              {initials(client.full_name_pseudonym)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold">{client.full_name_pseudonym}</h1>
            <p className="text-sm text-muted-foreground">
              {demographics.length ? demographics.join("  ·  ") : "No demographic data"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Client since {monthYear(client.created_at)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/messages?with=${client.id}`}>
              <MessageSquare className="size-4" />
              Send message
            </Link>
          </Button>
          <NewAppointmentDialog
            lockedClient={{ id: client.id, name: client.full_name_pseudonym }}
            triggerLabel="Schedule"
            triggerVariant="outline"
          />
        </div>
      </Card>

      <GeneratePlanButton clientId={client.id} />

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-control bg-brand-soft text-brand">
            <CalendarDays className="size-5" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Next session
            </p>
            {nextAppointment ? (
              <p className="text-sm font-medium">
                {formatAppointmentWhen(
                  nextAppointment.scheduled_at,
                  nextAppointment.duration_min
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No upcoming appointments.
              </p>
            )}
          </div>
        </div>
        {nextAppointment && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/calendar">View calendar</Link>
          </Button>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Body measurements</CardTitle>
          </CardHeader>
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <Measure label="Height" value={client.height_cm ? `${client.height_cm} cm` : null} />
            <Measure label="Weight" value={client.weight_kg ? `${client.weight_kg} kg` : null} />
            <Measure label="Sex" value={sexLabel(client.sex)} />
            <Measure label="Activity" value={activityLabel(client.activity_level)} />
          </dl>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current meal plan</CardTitle>
          </CardHeader>
          {plan ? (
            <div className="flex flex-col gap-3 text-sm">
              <div>
                <Link
                  href={`/plans/${plan.id}`}
                  className="font-medium hover:text-brand"
                >
                  {plan.duration_days}-day plan
                </Link>
                <p className="text-muted-foreground">
                  Starts {monthYear(plan.start_date)}
                </p>
              </div>
              <div>
                {plan.approved_at ? (
                  <Badge variant="success">Signed</Badge>
                ) : (
                  <Badge variant="warning">Draft</Badge>
                )}
              </div>
              {planMacros && planMacros.countedItems > 0 && (
                <MacroPanel macros={planMacros} />
              )}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No plan assigned yet.
            </p>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle>Dietary rules</CardTitle>
          <Button asChild size="sm" variant="outline">
            <Link href={`/clients/${client.id}/constraints/new`}>
              <Plus className="size-4" />
              Add rule
            </Link>
          </Button>
        </CardHeader>
        {constraints.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No rules for this client yet.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map(({ group, items }) => (
              <div key={group}>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group}
                </h4>
                <ul className="flex flex-col divide-y divide-border">
                  {items.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm"
                    >
                      <span>{constraintLabel(c)}</span>
                      <div className="flex items-center gap-3">
                        <Badge variant={c.priority === "hard" ? "critical" : "neutral"}>
                          {priorityLabel(c.priority)}
                        </Badge>
                        <DeleteConstraintButton
                          clientId={client.id}
                          constraintId={c.id}
                          label={constraintLabel(c)}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Meals per day and plan length are set when you generate a plan, not
          here.
        </p>
      </Card>
    </div>
  );
}

function Measure({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value ?? "-"}</dd>
    </div>
  );
}

function groupConstraints(constraints: ConstraintRow[]) {
  const byGroup = new Map<string, ConstraintRow[]>();
  for (const c of constraints) {
    const g = constraintGroup(c);
    const list = byGroup.get(g) ?? [];
    list.push(c);
    byGroup.set(g, list);
  }
  return Array.from(byGroup, ([group, items]) => ({ group, items }));
}
