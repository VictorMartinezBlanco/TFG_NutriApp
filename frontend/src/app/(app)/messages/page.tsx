import Link from "next/link";
import { requireNutritionist } from "@/lib/supabase/session";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  buildConversations,
  messageTime,
  type MessageRow,
} from "@/lib/messages";
import { MessagesThread } from "./messages-thread";
import { markThreadRead } from "./_actions";

export const dynamic = "force-dynamic";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: { with?: string };
}) {
  const { supabase } = await requireNutritionist();

  const withId = Number(searchParams.with);
  const hasSelection = Number.isInteger(withId) && withId > 0;

  // Todos los mensajes del nutri (RLS) para construir la lista de conversaciones,
  // y los nombres de sus clientes.
  const [{ data: msgData }, { data: clientData }] = await Promise.all([
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

  const messages = (msgData as MessageRow[] | null) ?? [];
  const names = new Map<number, string>(
    (clientData ?? []).map((c) => [c.id as number, c.full_name_pseudonym as string])
  );
  const conversations = buildConversations(messages, names);

  // Hilo seleccionado: solo sus mensajes. Marca leidos al abrir.
  let threadMessages: MessageRow[] = [];
  let threadName = "";
  let threadValid = false;
  if (hasSelection && names.has(withId)) {
    threadValid = true;
    threadName = names.get(withId) ?? "";
    threadMessages = messages.filter((m) => m.client_id === withId);
    await markThreadRead(withId);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Messages</h1>
        <p className="text-sm text-muted-foreground">
          Conversations with your clients.
        </p>
      </div>

      <Card className="grid h-[70vh] grid-cols-1 overflow-hidden p-0 md:grid-cols-[20rem_1fr]">
        <aside className="flex flex-col overflow-y-auto border-b border-border md:border-b-0 md:border-r">
          {conversations.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No conversations yet.</p>
          ) : (
            conversations.map((c) => {
              const active = threadValid && c.clientId === withId;
              return (
                <Link
                  key={c.clientId}
                  href={`/messages?with=${c.clientId}`}
                  className={`flex items-start gap-3 border-b border-border px-4 py-3 hover:bg-muted/40 ${
                    active ? "bg-brand-soft" : ""
                  }`}
                >
                  <Avatar name={c.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{c.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {messageTime(c.lastAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-muted-foreground">
                        {c.lastBody}
                      </span>
                      {c.unread > 0 && (
                        <Badge variant="success" className="shrink-0">
                          {c.unread}
                        </Badge>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </aside>

        <div className="min-h-0">
          {threadValid ? (
            <MessagesThread
              key={withId}
              clientId={withId}
              clientName={threadName}
              initialMessages={threadMessages}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <p className="text-sm text-muted-foreground">Select a conversation.</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-medium text-brand">
      {initials}
    </span>
  );
}
