"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Loader2, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  proposedLabel,
  priorityLabel,
  type GenerationTask,
  type NameMaps,
  type ProposedConstraint,
  type RejectedItem,
  type TranslateResult,
} from "@/lib/generation";
import { confirmGeneration, type ConfirmState } from "./_actions";

const POLL_MS = 4000;
// Tras este tiempo en cola, avisamos de que el worker puede no estar arrancado.
const WORKER_HINT_MS = 20000;

type Decision = "permanent" | "temporary" | "discard";

const initial: ConfirmState = { error: null };

export function ReviewFlow({
  taskId,
  clientId,
  durationDays,
  mealsPerDay,
  names,
}: {
  taskId: number;
  clientId: number;
  durationDays: number;
  mealsPerDay: number;
  names: NameMaps;
}) {
  const [task, setTask] = useState<GenerationTask | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let alive = true;
    const started = Date.now();

    async function tick() {
      const res = await fetch(`/api/generation-tasks?id=${taskId}`, {
        cache: "no-store",
      });
      const body = await res.json().catch(() => null);
      if (!alive) return;
      const t = (body?.task as GenerationTask | null) ?? null;
      setTask(t);
      setElapsed(Date.now() - started);
      if (t && (t.status === "done" || t.status === "failed")) {
        clearInterval(id);
      }
    }

    const id = setInterval(tick, POLL_MS);
    void tick();
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [taskId]);

  if (!task || task.status === "queued" || task.status === "in_progress") {
    return <Waiting elapsed={elapsed} />;
  }

  if (task.status === "failed") {
    return (
      <Card className="max-w-2xl">
        <p className="text-sm text-danger">
          The copilot could not read your notes. {task.error ?? ""}
        </p>
      </Card>
    );
  }

  const result = (task.result as TranslateResult | null) ?? {
    constraints: [],
    rejected: [],
  };
  return (
    <ReviewModal
      clientId={clientId}
      durationDays={durationDays}
      mealsPerDay={mealsPerDay}
      constraints={result.constraints ?? []}
      rejected={result.rejected ?? []}
      names={names}
    />
  );
}

function Waiting({ elapsed }: { elapsed: number }) {
  return (
    <Card className="flex max-w-2xl flex-col items-center gap-3 py-10 text-center">
      <Loader2 className="size-6 animate-spin text-brand" />
      <p className="text-sm font-medium">Reading your notes...</p>
      {elapsed > WORKER_HINT_MS && (
        <p className="max-w-sm text-xs text-muted-foreground">
          This is taking longer than usual. The generation worker may not be
          running yet. It will be picked up as soon as it starts.
        </p>
      )}
    </Card>
  );
}

function ReviewModal({
  clientId,
  durationDays,
  mealsPerDay,
  constraints,
  rejected,
  names,
}: {
  clientId: number;
  durationDays: number;
  mealsPerDay: number;
  constraints: ProposedConstraint[];
  rejected: RejectedItem[];
  names: NameMaps;
}) {
  const [state, formAction] = useFormState(confirmGeneration, initial);
  const [decisions, setDecisions] = useState<Record<number, Decision>>(
    Object.fromEntries(constraints.map((_, i) => [i, "temporary" as Decision]))
  );

  const kept = constraints.filter((_, i) => decisions[i] !== "discard").length;

  return (
    <Card className="max-w-2xl">
      <form action={formAction} className="flex flex-col gap-5">
        <div>
          <h2 className="text-lg font-semibold">Review the constraints</h2>
          <p className="text-sm text-muted-foreground">
            Decide what to keep on the client&apos;s profile, what to use only
            for this plan, and what to drop.
          </p>
        </div>

        {constraints.length === 0 ? (
          <p className="rounded-control border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
            The copilot did not find any constraint it could apply. Go back and
            rephrase, or add them by hand from the client&apos;s profile.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {constraints.map((c, i) => (
              <li
                key={i}
                className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <Badge variant={c.priority === "hard" ? "warning" : "info"}>
                    {priorityLabel(c.priority)}
                  </Badge>
                  <span className="text-sm">{proposedLabel(c, names)}</span>
                </div>
                <ChoiceGroup
                  value={decisions[i]}
                  onChange={(v) => setDecisions((d) => ({ ...d, [i]: v }))}
                />
              </li>
            ))}
          </ul>
        )}

        {rejected.length > 0 && (
          <div className="rounded-control border border-warning/40 bg-warning/10 px-3 py-3">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <AlertTriangle className="size-4 text-warning" />
              Not understood ({rejected.length})
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {rejected.map((r, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  {r.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="duration_days" value={durationDays} />
        <input type="hidden" name="meals_per_day" value={mealsPerDay} />
        <input type="hidden" name="constraints" value={JSON.stringify(constraints)} />
        <input type="hidden" name="decisions" value={JSON.stringify(decisions)} />

        {state.error && <p className="text-sm text-danger">{state.error}</p>}

        <div className="flex items-center gap-2">
          <ConfirmButton keptCount={kept} />
        </div>
      </form>
    </Card>
  );
}

function ChoiceGroup({
  value,
  onChange,
}: {
  value: Decision;
  onChange: (v: Decision) => void;
}) {
  const options: { key: Decision; label: string }[] = [
    { key: "permanent", label: "Save" },
    { key: "temporary", label: "This plan" },
    { key: "discard", label: "Drop" },
  ];
  return (
    <div className="flex overflow-hidden rounded-control border border-border">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`px-2.5 py-1 text-xs transition-colors ${
            value === o.key
              ? "bg-brand text-brand-foreground"
              : "bg-card text-muted-foreground hover:bg-muted/40"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ConfirmButton({ keptCount }: { keptCount: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {pending ? "Starting..." : `Generate plan (${keptCount})`}
    </Button>
  );
}
