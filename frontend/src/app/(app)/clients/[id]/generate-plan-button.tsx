import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Lleva al flujo de generacion asincrona con el cliente ya elegido. La
// generacion ya no bloquea la ficha: el nutri describe, revisa y el plan se
// construye en segundo plano.
export function GeneratePlanButton({ clientId }: { clientId: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild size="sm">
        <Link href={`/plans/generate?client=${clientId}`}>
          <Sparkles className="size-4" />
          Generate plan with AI
        </Link>
      </Button>
      <Button type="button" variant="outline" size="sm" disabled>
        Upload historical plan
      </Button>
      <Badge variant="info">Upload available soon</Badge>
    </div>
  );
}
