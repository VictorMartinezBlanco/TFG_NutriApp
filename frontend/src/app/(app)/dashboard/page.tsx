import Link from "next/link";
import {
  Sparkles,
  Users,
  ClipboardList,
  FileClock,
  Apple,
  CalendarDays,
} from "lucide-react";
import { requireNutritionist } from "@/lib/supabase/session";
import { firstName, initials } from "@/lib/format";
import {
  formatAppointmentWhen,
  splitUpcomingPast,
  type AppointmentRow,
} from "@/lib/appointments";
import {
  buildConversations,
  messageTime,
  type MessageRow,
} from "@/lib/messages";
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
  const [
    clientsCount,
    plansCount,
    unsignedCount,
    foodsCount,
    recentClients,
    upcomingData,
    messagesData,
    clientNames,
  ] = await Promise.all([
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
    supabase
      .from("appointment")
      .select("id, scheduled_at, duration_min, status, notes, client:client_id (id, full_name_pseudonym)")
      .neq("status", "cancelled")
      .is("deleted_at", null)
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("message")
      .select("id, client_id, sender, body, read_at, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("client")
      .select("id, full_name_pseudonym")
      .is("deleted_at", null),
  ]);

  const clients = (recentClients.data as Client[] | null) ?? [];

  // por hora de fin, para que una cita en curso siga contando como proxima
  // (mismo criterio que el calendario).
  const upcoming = splitUpcomingPast(
    (upcomingData.data as AppointmentRow[] | null) ?? [],
    new Date()
  ).upcoming.slice(0, 5);

  const names = new Map<number, string>(
    (clientNames.data ?? []).map((c) => [
      c.id as number,
      c.full_name_pseudonym as string,
    ])
  );
  const unreadConversations = buildConversations(
    (messagesData.data as MessageRow[] | null) ?? [],
    names
  )
    .filter((c) => c.unread > 0)
    .slice(0, 5);

  const kpis = [
    { label: "Active clients", value: clientsCount.count ?? 0, icon: Users, href: "/clients" },
    { label: "Plans", value: plansCount.count ?? 0, icon: ClipboardList, href: "/plans" },
    { label: "Drafts to sign", value: unsignedCount.count ?? 0, icon: FileClock, href: "/plans" },
    { label: "Foods in library", value: foodsCount.count ?? 0, icon: Apple, href: "/foods" },
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
            <Link key={kpi.label} href={kpi.href}>
              <Card className="flex items-center gap-4 transition-colors hover:bg-muted/40">
                <span className="flex size-10 items-center justify-center rounded-control bg-brand-soft text-brand">
                  <Icon className="size-5" />
                </span>
                <div>
                  <div className="text-2xl font-bold">{kpi.value}</div>
                  <div className="text-xs text-muted-foreground">{kpi.label}</div>
                </div>
              </Card>
            </Link>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming appointments</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/calendar">View all</Link>
            </Button>
          </CardHeader>

          {upcoming.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No upcoming appointments.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {upcoming.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-3">
                  <span className="flex size-9 items-center justify-center rounded-control bg-brand-soft text-brand">
                    <CalendarDays className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {a.client?.full_name_pseudonym ?? "Unknown client"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatAppointmentWhen(a.scheduled_at, a.duration_min)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Unread messages</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/messages">View all</Link>
            </Button>
          </CardHeader>

          {unreadConversations.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No unread messages.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {unreadConversations.map((c) => (
                <li key={c.clientId} className="py-3">
                  <Link
                    href={`/messages?with=${c.clientId}`}
                    className="flex items-center gap-3"
                  >
                    <Avatar>
                      <AvatarFallback>{initials(c.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {messageTime(c.lastAt)}
                        </span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.lastBody}
                      </p>
                    </div>
                    <Badge variant="success">{c.unread}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
