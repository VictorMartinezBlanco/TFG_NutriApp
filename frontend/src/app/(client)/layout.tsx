import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { AcademicDisclaimer } from "@/components/layout/academic-disclaimer";
import { requireClient } from "@/lib/supabase/session";

// Mismo shell que el panel del profesional con otro juego de secciones: el
// sidebar es una variante de datos, no un sistema aparte.
export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, client } = await requireClient();

  // Sin leer del hilo: solo cuenta lo que le ha escrito su nutricionista y
  // sigue sin leer. Se apoya en el indice parcial de mensajes no leidos.
  const { count } = await supabase
    .from("message")
    .select("id", { count: "exact", head: true })
    .eq("sender", "nutritionist")
    .is("read_at", null)
    .is("deleted_at", null);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar variant="client" badges={{ "/my/messages": count ?? 0 }} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header fullName={client.fullName} subtitle="Client" />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
        <AcademicDisclaimer className="shrink-0 border-t border-border bg-card px-6 py-2 text-center text-xs text-muted-foreground" />
      </div>
    </div>
  );
}
