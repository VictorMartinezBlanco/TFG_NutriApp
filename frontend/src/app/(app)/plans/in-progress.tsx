"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Clock, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  coreLine,
  statusLabel,
  statusVariant,
  type GenerationTask,
  type InfeasibleInfo,
} from "@/lib/generation";

const POLL_MS = 4000;
// A partir de aqui el badge sugiere que el worker puede no estar arrancado.
const WORKER_HINT_MS = 120000;

// Subapartado de generaciones de Planes. Pollea las tareas activas del nutri
// (RLS) mas las fallidas recientes: una infactibilidad se muestra con su
// explicacion en vez de desaparecer. Al pasar a done el plan aparece en la
// lista de abajo.
export function InProgress({ clientNames }: { clientNames: Record<number, string> }) {
  const [tasks, setTasks] = useState<GenerationTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const router = useRouter();
  const prevCount = useRef(0);

  useEffect(() => {
    let alive = true;

    async function tick() {
      const res = await fetch("/api/generation-tasks?generate=1", {
        cache: "no-store",
      });
      const body = await res.json().catch(() => null);
      if (!alive) return;
      const next = (body?.tasks as GenerationTask[] | null) ?? [];
      // Una tarea que sale de la lista ha terminado bien: refresca el Server
      // Component para que el plan recien persistido aparezca abajo.
      if (next.length < prevCount.current) {
        router.refresh();
      }
      prevCount.current = next.length;
      setTasks(next);
      setLoaded(true);
    }

    const id = setInterval(tick, POLL_MS);
    void tick();
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!loaded || tasks.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Recent generations</h2>
      <div className="flex flex-col gap-2">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} clientName={clientNames[t.client_id]} />
        ))}
      </div>
    </div>
  );
}

function TaskRow({ task, clientName }: { task: GenerationTask; clientName?: string }) {
  if (task.status === "failed") {
    return <FailedRow task={task} clientName={clientName} />;
  }

  const waited = Date.now() - new Date(task.created_at).getTime();
  const stale = task.status === "queued" && waited > WORKER_HINT_MS;

  return (
    <Card className="flex items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-3">
        <Loader2 className="size-4 animate-spin text-brand" />
        <div>
          <p className="text-sm font-medium">
            Plan for {clientName ?? "client"}
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" />
            {stale
              ? "Waiting for the generation worker to pick this up"
              : `${ago(waited)}`}
          </p>
        </div>
      </div>
      <Badge variant={statusVariant(task.status)}>{statusLabel(task.status)}</Badge>
    </Card>
  );
}

// Un generate fallido muestra su explicacion llana (columna error) y, si el
// diagnostico trae el nucleo del conflicto, un detalle expandible con nombres.
function FailedRow({ task, clientName }: { task: GenerationTask; clientName?: string }) {
  const infeasible = (task.result?.infeasible as InfeasibleInfo | undefined) ?? null;

  return (
    <Card className="flex flex-col gap-2 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
          <div>
            <p className="text-sm font-medium">
              Plan for {clientName ?? "client"} could not be generated
            </p>
            <p className="text-xs text-muted-foreground">
              {task.error ?? "The generation failed."}
            </p>
          </div>
        </div>
        <Badge variant={statusVariant(task.status)}>{statusLabel(task.status)}</Badge>
      </div>
      {infeasible && infeasible.core.length > 0 && (
        <details className="pl-7">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Show details
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1">
            {infeasible.core.map((item, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                {coreLine(item)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function ago(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `Started ${s}s ago`;
  const m = Math.floor(s / 60);
  return `Started ${m} min ago`;
}
