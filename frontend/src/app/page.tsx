import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { resolveSession } from "@/lib/supabase/session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/layout/logo";

// Punto de reparto: el login es uno solo y desde aqui cada rol va a su panel.
export default async function RootPage() {
  const { role, user } = await resolveSession();

  if (role === "nutritionist") redirect("/dashboard");
  if (role === "client") redirect("/my/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="flex w-full max-w-sm flex-col gap-4 text-center">
        <Logo />
        <p className="text-sm text-muted-foreground">
          The account {user.email} is not linked to a nutritionist or a client
          profile yet. Ask your nutritionist to finish setting it up.
        </p>
        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </Card>
    </main>
  );
}
