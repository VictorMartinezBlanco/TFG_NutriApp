import Link from "next/link";
import { Plus } from "lucide-react";
import { requireNutritionist } from "@/lib/supabase/session";
import {
  constraintLabel,
  constraintGroup,
  priorityLabel,
  type ConstraintRow,
} from "@/lib/constraints";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProfileForm } from "./profile-form";
import { AvailabilityEditor, type AvailabilityBlock } from "./availability-editor";
import { DeleteRuleButton } from "./clinical/delete-rule-button";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "profile", label: "Profile" },
  { key: "availability", label: "Availability" },
  { key: "notifications", label: "Notifications" },
  { key: "clinical", label: "My clinical style" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const { supabase, user } = await requireNutritionist();
  const active: TabKey =
    (TABS.find((t) => t.key === searchParams.tab)?.key as TabKey) ?? "profile";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your personal information, availability and preferences.
        </p>
      </div>

      <nav className="flex gap-6 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/settings?tab=${t.key}`}
            className={`-mb-px border-b-2 pb-3 text-sm ${
              active === t.key
                ? "border-brand font-medium text-brand"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {active === "profile" && <ProfileTab supabase={supabase} userId={user.id} email={user.email ?? ""} />}
      {active === "availability" && <AvailabilityTab supabase={supabase} userId={user.id} />}
      {active === "notifications" && <NotificationsTab />}
      {active === "clinical" && <ClinicalTab supabase={supabase} userId={user.id} />}
    </div>
  );
}

async function ProfileTab({
  supabase,
  userId,
  email,
}: {
  supabase: Awaited<ReturnType<typeof requireNutritionist>>["supabase"];
  userId: string;
  email: string;
}) {
  const { data: profile } = await supabase
    .from("nutritionist")
    .select("full_name, license_number")
    .eq("id", userId)
    .single();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal information</CardTitle>
      </CardHeader>
      <div className="max-w-md">
        <ProfileForm
          fullName={profile?.full_name ?? ""}
          email={email}
          licenseNumber={profile?.license_number ?? ""}
        />
      </div>
    </Card>
  );
}

async function AvailabilityTab({
  supabase,
  userId,
}: {
  supabase: Awaited<ReturnType<typeof requireNutritionist>>["supabase"];
  userId: string;
}) {
  const { data } = await supabase
    .from("availability")
    .select("day_of_week, start_time, end_time")
    .eq("nutritionist_id", userId)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  // start_time/end_time vienen como HH:MM:SS; el input time quiere HH:MM.
  const blocks: AvailabilityBlock[] = (data ?? []).map((b) => ({
    day: b.day_of_week as number,
    start: String(b.start_time).slice(0, 5),
    end: String(b.end_time).slice(0, 5),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly availability</CardTitle>
      </CardHeader>
      <AvailabilityEditor blocks={blocks} />
    </Card>
  );
}

function NotificationsTab() {
  const items = [
    { label: "Email me when an appointment is scheduled", checked: true },
    { label: "Email me when a message is received", checked: true },
    { label: "Email me when a plan is signed", checked: false },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <Badge variant="neutral">Available soon</Badge>
      </CardHeader>
      <p className="mb-4 text-sm text-muted-foreground">
        Notification delivery is not wired up yet. These options are a preview.
      </p>
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <label key={item.label} className="flex items-center gap-3 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={item.checked}
              disabled
              readOnly
              className="size-4 rounded border-input accent-brand"
            />
            {item.label}
          </label>
        ))}
      </div>
    </Card>
  );
}

async function ClinicalTab({
  supabase,
  userId,
}: {
  supabase: Awaited<ReturnType<typeof requireNutritionist>>["supabase"];
  userId: string;
}) {
  const { data } = await supabase
    .from("diet_constraint")
    .select(
      `id, type, operator, value, value2, priority, weight, context,
       tag:target_tag_id (name_en, kind),
       food:target_food_id (name_en),
       nutrient:target_nutrient_id (name_en, unit_default)`
    )
    .eq("scope_type", "nutritionist")
    .eq("scope_nutritionist_id", userId)
    .is("deleted_at", null)
    .order("priority", { ascending: true })
    .order("weight", { ascending: false });

  const constraints = (data as ConstraintRow[] | null) ?? [];

  // Agrupa por origen reusando la categorizacion de la ficha de cliente.
  const groups = new Map<string, ConstraintRow[]>();
  for (const c of constraints) {
    const g = constraintGroup(c);
    const list = groups.get(g) ?? [];
    list.push(c);
    groups.set(g, list);
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle>My clinical style</CardTitle>
        <Button asChild size="sm" variant="outline">
          <Link href="/settings/clinical/new">
            <Plus className="size-4" />
            Add rule
          </Link>
        </Button>
      </CardHeader>
      <p className="mb-4 text-sm text-muted-foreground">
        Rules you follow with every client. They apply to every plan you generate,
        on top of each client&apos;s own rules.
      </p>

      {constraints.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No rules yet. Add the ones you apply to everyone, like a family you never
          include or a protein floor you always keep.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {Array.from(groups.entries()).map(([group, list]) => (
            <div key={group}>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group}
              </h4>
              <ul className="flex flex-col divide-y divide-border">
                {list.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm"
                  >
                    <span>{constraintLabel(c)}</span>
                    <div className="flex items-center gap-3">
                      <Badge variant={c.priority === "hard" ? "critical" : "neutral"}>
                        {priorityLabel(c.priority)}
                      </Badge>
                      <DeleteRuleButton constraintId={c.id} label={constraintLabel(c)} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
