import Link from "next/link";
import { Search, Sparkles, Upload } from "lucide-react";
import { requireNutritionist } from "@/lib/supabase/session";
import { monthYear } from "@/lib/format";
import { planStatus, planStatusLabel } from "@/lib/plans";
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
                  <th className="px-5 py-3 font-medium">Start</th>
                  <th className="px-5 py-3 font-medium">Duration</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {plans.map((p) => {
                  const status = planStatus(p.approved_at);
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
                      <td className="px-5 py-3 text-muted-foreground">
                        {monthYear(p.start_date)}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {p.duration_days} days
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {monthYear(p.created_at)}
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
