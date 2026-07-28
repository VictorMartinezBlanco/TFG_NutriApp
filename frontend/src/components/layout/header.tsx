import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions";
import { initials } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function Header({
  fullName,
  subtitle,
}: {
  fullName: string;
  subtitle: string;
}) {
  return (
    <header className="flex h-header shrink-0 items-center justify-end gap-4 border-b border-border bg-card px-6">
      <div className="flex items-center gap-3">
        <div className="text-right leading-tight">
          <p className="text-sm font-semibold">{fullName}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Avatar>
          <AvatarFallback>{initials(fullName)}</AvatarFallback>
        </Avatar>
      </div>
      <form action={signOut}>
        <button
          className="text-muted-foreground hover:text-foreground"
          aria-label="Cerrar sesión"
        >
          <LogOut className="size-5" />
        </button>
      </form>
    </header>
  );
}
