import { requireClient } from "@/lib/supabase/session";
import type { MessageRow } from "@/lib/messages";
import { Card } from "@/components/ui/card";
import { ClientThread } from "./client-thread";

export const dynamic = "force-dynamic";

export default async function MyMessagesPage() {
  const { supabase } = await requireClient();

  // Un solo hilo: el cliente solo habla con su nutricionista, asi que no hay
  // lista de conversaciones que elegir como en el panel del profesional.
  const [{ data: rawMessages }, { data: nutri }] = await Promise.all([
    supabase
      .from("message")
      .select("id, client_id, sender, body, read_at, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase.from("nutritionist").select("full_name").limit(1),
  ]);

  // Abrir la conversacion es leerla. Va por la funcion porque el cliente no
  // tiene UPDATE sobre message.
  await supabase.rpc("client_mark_thread_read");

  const messages = (rawMessages as MessageRow[] | null) ?? [];
  const nutritionistName =
    (nutri as { full_name: string }[] | null)?.[0]?.full_name ??
    "Your nutritionist";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Messages</h1>
        <p className="text-sm text-muted-foreground">
          Your conversation with {nutritionistName}.
        </p>
      </div>

      <Card className="h-[70vh] overflow-hidden p-0">
        <ClientThread
          nutritionistName={nutritionistName}
          initialMessages={messages}
        />
      </Card>
    </div>
  );
}
