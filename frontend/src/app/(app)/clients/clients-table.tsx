"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
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

export type ClientRow = {
  id: number;
  full_name_pseudonym: string;
  sex: string | null;
  birth_date: string | null;
  activity_level: string | null;
  created_at: string;
};

// La lista ya llega filtrada por RLS; el buscador solo acota por nombre en el
// navegador, sin volver a consultar.
export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? clients.filter((c) => c.full_name_pseudonym.toLowerCase().includes(needle))
    : clients;

  return (
    <>
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients by name"
          aria-label="Search clients by name"
          className="h-10 w-full rounded-control border border-border bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground"
        />
      </div>

      {clients.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-muted-foreground">
            You have no clients yet.
          </p>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-muted-foreground">
            No clients match &quot;{query}&quot;.
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
                <th className="px-5 py-3 font-medium">Activity</th>
                <th className="px-5 py-3 font-medium">Since</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((c) => {
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
    </>
  );
}
