// Helpers de mensajeria. El polling vive en el componente cliente del hilo;
// aqui solo tipos y la agrupacion de mensajes en conversaciones por cliente.

export type MessageRow = {
  id: number;
  client_id: number;
  sender: "nutritionist" | "client";
  body: string;
  read_at: string | null;
  created_at: string;
};

export type Conversation = {
  clientId: number;
  name: string;
  lastBody: string;
  lastAt: string;
  unread: number;
};

// Una conversacion por cliente con al menos un mensaje. unread = mensajes del
// cliente sin leer. Ordena por el ultimo mensaje, mas reciente primero.
export function buildConversations(
  rows: MessageRow[],
  names: Map<number, string>
): Conversation[] {
  const byClient = new Map<number, MessageRow[]>();
  for (const row of rows) {
    const list = byClient.get(row.client_id) ?? [];
    list.push(row);
    byClient.set(row.client_id, list);
  }

  const conversations: Conversation[] = [];
  for (const [clientId, list] of Array.from(byClient.entries())) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const last = list[list.length - 1];
    const unread = list.filter((m) => m.sender === "client" && m.read_at == null).length;
    conversations.push({
      clientId,
      name: names.get(clientId) ?? "Unknown client",
      lastBody: last.body,
      lastAt: last.created_at,
      unread,
    });
  }

  conversations.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  return conversations;
}

// Hora corta para el preview de la lista y las burbujas.
export function messageTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}
