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
  const { client } = await requireClient();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar variant="client" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header fullName={client.fullName} subtitle="Client" />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
        <AcademicDisclaimer className="shrink-0 border-t border-border bg-card px-6 py-2 text-center text-xs text-muted-foreground" />
      </div>
    </div>
  );
}
