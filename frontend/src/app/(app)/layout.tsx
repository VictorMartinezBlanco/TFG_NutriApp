import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { AcademicDisclaimer } from "@/components/layout/academic-disclaimer";
import { requireNutritionist } from "@/lib/supabase/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { fullName } = await requireNutritionist();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header fullName={fullName} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
        <AcademicDisclaimer className="shrink-0 border-t border-border bg-card px-6 py-2 text-center text-xs text-muted-foreground" />
      </div>
    </div>
  );
}
