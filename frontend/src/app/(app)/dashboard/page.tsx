import Link from "next/link";
import { Sparkles, Users, ClipboardList, FileClock, Apple } from "lucide-react";
import { requireNutritionist } from "@/lib/supabase/session";
import { firstName, initials } from "@/lib/format";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const dynamic = "force-dynamic";

type Client = {
  id: number;
  full_name_pseudonym: string;
  activity_level: string | null;
  created_at: string;
};

export default async function DashboardPage() {
  const { supabase, fullName } = await requireNutritionist();

  // todo lo de abajo se filtra por la rls a lo que es del nutri logueado.
  const [clientsCount, plansCount, unsignedCount, foodsCount, recentClients] =
    await Promise.all([
      supabase
        .from("client")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      supabase
        .from("plan")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      supabase
        .from("plan")
        .select("id", { count: "exact", head: true })
        .is("approved_at", null)
        .is("deleted_at", null),
      supabase
        .from("food")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      supabase
        .from("client")
        .select("id, full_name_pseudonym, activity_level, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const clients = (recentClients.data as Client[] | null) ?? [];

  const kpis = [
    { label: "Active clients", value: clientsCount.count ?? 0, icon: Users },
    { label: "Plans", value: plansCount.count ?? 0, icon: ClipboardList },
    { label: "Drafts to sign", value: unsignedCount.count ?? 0, icon: FileClock },
    { label: "Foods in library", value: foodsCount.count ?? 0, icon: Apple },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome back, {firstName(fullName)}
          </h1>
          <p className="text-sm text-muted-foreground">
            Here is what is going on with your practice today.
          </p>
        </div>
        <Button asChild>
          <Link href="/plans">
            <Sparkles className="size-4" />
            Generate plan
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="flex items-center gap-4">
              <span className="flex size-10 items-center justify-center rounded-control bg-brand-soft text-brand">
                <Icon className="size-5" />
              </span>
              <div>
                <div className="text-2xl font-bold">{kpi.value}</div>
                <div className="text-xs text-muted-foreground">{kpi.label}</div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent clients</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/clients">View all</Link>
          </Button>
        </CardHeader>

        {clients.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            You have no clients yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {clients.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <Avatar>
                  <AvatarFallback>
                    {initials(c.full_name_pseudonym)}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 text-sm font-medium">
                  {c.full_name_pseudonym}
                </span>
                {c.activity_level && (
                  <Badge variant="neutral">{c.activity_level}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
