import Link from "next/link";
import { Search } from "lucide-react";
import { requireNutritionist } from "@/lib/supabase/session";
import {
  initials,
  ageFromBirthDate,
  sexLabel,
  activityLabel,
  monthYear,
} from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

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

export default async function ClientsPage() {
  const { supabase } = await requireNutritionist();

  // la rls limita las filas al nutri logueado.
  const { data } = await supabase
    .from("client")
    .select(
      "id, full_name_pseudonym, sex, birth_date, height_cm, weight_kg, activity_level, created_at"
    )
    .is("deleted_at", null)
    .order("full_name_pseudonym", { ascending: true });

  const clients = (data as Client[] | null) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Clients</h1>
        <p className="text-sm text-muted-foreground">
          Your client roster and their key data.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          disabled
          placeholder="Search clients (coming soon)"
          className="h-10 w-full rounded-control border border-border bg-card pl-9 pr-3 text-sm text-muted-foreground placeholder:text-muted-foreground"
        />
      </div>

      {clients.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-muted-foreground">
            You have no clients yet.
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-medium">Client</th>
                <th className="px-5 py-3 font-medium">Age</th>
                <th className="px-5 py-3 font-medium">Sex</th>
                <th className="px-5 py-3 font-medium">Height</th>
                <th className="px-5 py-3 font-medium">Weight</th>
                <th className="px-5 py-3 font-medium">Activity</th>
                <th className="px-5 py-3 font-medium">Since</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clients.map((c) => {
                const age = ageFromBirthDate(c.birth_date);
                const activity = activityLabel(c.activity_level);
                return (
                  <tr key={c.id} className="hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <Link
                        href={`/clients/${c.id}`}
                        className="flex items-center gap-3 font-medium hover:text-brand"
                      >
                        <Avatar>
                          <AvatarFallback>
                            {initials(c.full_name_pseudonym)}
                          </AvatarFallback>
                        </Avatar>
                        {c.full_name_pseudonym}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {age ?? "-"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {sexLabel(c.sex) ?? "-"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {c.height_cm ? `${c.height_cm} cm` : "-"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {c.weight_kg ? `${c.weight_kg} kg` : "-"}
                    </td>
                    <td className="px-5 py-3">
                      {activity ? (
                        <Badge variant="neutral">{activity}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {monthYear(c.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
