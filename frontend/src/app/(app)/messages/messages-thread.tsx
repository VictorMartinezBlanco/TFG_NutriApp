"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { messageTime, type MessageRow } from "@/lib/messages";
import { sendMessage, type SendState } from "./_actions";

const POLL_MS = 15_000;
const initialState: SendState = { error: null };

export function MessagesThread({
  clientId,
  clientName,
  initialMessages,
}: {
  clientId: number;
  clientName: string;
  initialMessages: MessageRow[];
}) {
  const [messages, setMessages] = React.useState<MessageRow[]>(initialMessages);
  const [state, formAction] = useFormState(sendMessage, initialState);
  const formRef = React.useRef<HTMLFormElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  // El primer batch llega del servidor; al cambiar de conversacion se reemplaza.
  React.useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  // Polling: pide los mensajes posteriores al ultimo conocido y los anexa.
  React.useEffect(() => {
    const id = setInterval(async () => {
      const since = messagesSince(messages);
      const params = new URLSearchParams({ with: String(clientId) });
      if (since) params.set("since", since);
      try {
        const res = await fetch(`/api/messages?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const { messages: fresh } = (await res.json()) as { messages: MessageRow[] };
        if (fresh.length > 0) {
          setMessages((prev) => mergeById(prev, fresh));
        }
      } catch {
        // fallo de red puntual: se reintenta en el siguiente ciclo
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [clientId, messages]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Tras enviar sin error, limpia el input. El propio mensaje entra por el
  // siguiente poll (sin optimistic update, decision de diseno v0).
  const lastError = state.error;
  React.useEffect(() => {
    if (lastError === null) formRef.current?.reset();
  }, [lastError, state]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <Avatar name={clientName} />
        <p className="font-medium">{clientName}</p>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <p className="m-auto text-sm text-muted-foreground">
            No messages yet. Say hello.
          </p>
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} />)
        )}
        <div ref={bottomRef} />
      </div>

      <form
        ref={formRef}
        action={formAction}
        className="flex items-end gap-3 border-t border-border p-4"
      >
        <input type="hidden" name="client_id" value={clientId} />
        <textarea
          name="body"
          rows={1}
          placeholder={`Write your message to ${clientName.split(" ")[0]}...`}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-control border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <SendButton />
      </form>
      {state.error && (
        <p className="px-4 pb-3 text-sm text-danger">{state.error}</p>
      )}
    </div>
  );
}

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Send className="size-4" />
      {pending ? "Sending..." : "Send"}
    </Button>
  );
}

function Bubble({ message }: { message: MessageRow }) {
  const mine = message.sender === "nutritionist";
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[75%] rounded-card px-3 py-2 text-sm ${
          mine ? "bg-brand text-brand-foreground" : "bg-muted text-foreground"
        }`}
      >
        {message.body}
      </div>
      <span className="mt-1 text-xs text-muted-foreground">
        {messageTime(message.created_at)}
      </span>
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
    <span className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-xs font-medium text-brand">
      {initials}
    </span>
  );
}

function messagesSince(messages: MessageRow[]): string | null {
  if (messages.length === 0) return null;
  return messages.reduce(
    (max, m) => (m.created_at > max ? m.created_at : max),
    messages[0].created_at
  );
}

function mergeById(prev: MessageRow[], fresh: MessageRow[]): MessageRow[] {
  const seen = new Set(prev.map((m) => m.id));
  const merged = [...prev, ...fresh.filter((m) => !seen.has(m.id))];
  merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return merged;
}
