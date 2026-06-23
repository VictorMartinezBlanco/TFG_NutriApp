import { Utensils } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ showText = true }: { showText?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-brand text-brand-foreground">
        <Utensils className="size-4" />
      </span>
      {showText && (
        <span className={cn("text-lg font-bold text-foreground")}>
          NutriApp
        </span>
      )}
    </div>
  );
}
