"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import {
  AlertTriangle,
  Ban,
  HelpCircle,
  Languages,
  Loader2,
  Plus,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  precheckPresentation,
  proposedLabel,
  priorityLabel,
  type GenerationTask,
  type NameMaps,
  type Precheck,
  type ProposedConstraint,
  type RejectedItem,
} from "@/lib/generation";
import { buildConstraintRow } from "@/lib/constraint-row";
import type { loadConstraintCatalog } from "@/lib/constraint-catalog";
import { ConstraintForm } from "@/app/(app)/clients/[id]/constraints/constraint-form";
import { confirmGeneration, type ConfirmState } from "./_actions";

const POLL_MS = 4000;
// Tras este tiempo en cola, avisamos de que el worker puede no estar arrancado.
const WORKER_HINT_MS = 20000;

type Catalog = Awaited<ReturnType<typeof loadConstraintCatalog>>;

type Decision = "permanent" | "temporary" | "discard";
type Origin = "ai" | "manual";

// Fila de la lista unificada de revision: la propuesta, quien la produjo y que
// decide el nutri con ella. El unit_id solo aplica a las manuales al guardarse.
type ReviewItem = {
  c: ProposedConstraint;
  origin: Origin;
  decision: Decision;
  unit_id: number | null;
};

const initial: ConfirmState = { error: null };

export function ReviewFlow({
  taskId,
  clientId,
  durationDays,
  mealsPerDay,
  names,
  catalog,
}: {
  taskId: number | null;
  clientId: number;
  durationDays: number;
  mealsPerDay: number;
  names: NameMaps;
  catalog: Catalog;
}) {
  const [task, setTask] = useState<GenerationTask | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (taskId === null) return;
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

  const shared = { clientId, durationDays, mealsPerDay, names, catalog };

  if (taskId === null) {
    return <ReviewList {...shared} constraints={[]} rejected={[]} manual />;
  }

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

  const result = task.result ?? {};
  const precheck = result.precheck;
  if (precheck && precheck.status !== "ok") {
    return (
      <PrecheckNotice
        precheck={precheck}
        editHref={editHref(clientId, durationDays, mealsPerDay, task.input_text)}
      />
    );
  }

  return (
    <ReviewList
      {...shared}
      constraints={result.constraints ?? []}
      rejected={result.rejected ?? []}
    />
  );
}

function editHref(
  clientId: number,
  durationDays: number,
  mealsPerDay: number,
  inputText: string | null
): string {
  return (
    `/plans/generate?client=${clientId}&days=${durationDays}` +
    `&meals=${mealsPerDay}&text=${encodeURIComponent(inputText ?? "")}`
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

const PRECHECK_ICONS = {
  out_of_scope: Ban,
  unsupported_language: Languages,
  missing_info: HelpCircle,
  contradiction: AlertTriangle,
} as const;

const PRECHECK_ICON_TONE = {
  info: "text-info",
  warning: "text-warning",
  critical: "text-danger",
} as const;

// El mensaje que el nutri lee cuando las pasadas previas paran su texto. El
// backend ya lo redacta; aqui solo se enmarca por tipo y se ofrece corregir.
function PrecheckNotice({
  precheck,
  editHref,
}: {
  precheck: Precheck;
  editHref: string;
}) {
  const status = precheck.status as Exclude<Precheck["status"], "ok">;
  const look = precheckPresentation(status);
  const Icon = PRECHECK_ICONS[status];

  return (
    <Card className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <Icon className={`size-5 ${PRECHECK_ICON_TONE[look.variant]}`} />
        <Badge variant={look.variant}>{look.label}</Badge>
      </div>
      <p className="text-sm">{precheck.message}</p>
      {precheck.details.length > 0 && (
        <ul className="flex flex-col gap-1.5 rounded-control border border-border bg-muted/30 px-3 py-3">
          {precheck.details.map((d, i) => (
            <li key={i} className="text-xs text-muted-foreground">
              {d}
            </li>
          ))}
        </ul>
      )}
      <div>
        <Link href={editHref} className={buttonVariants({ variant: "outline" })}>
          Edit message
        </Link>
      </div>
    </Card>
  );
}

function ReviewList({
  clientId,
  durationDays,
  mealsPerDay,
  constraints,
  rejected,
  names,
  catalog,
  manual = false,
}: {
  clientId: number;
  durationDays: number;
  mealsPerDay: number;
  constraints: ProposedConstraint[];
  rejected: RejectedItem[];
  names: NameMaps;
  catalog: Catalog;
  manual?: boolean;
}) {
  const [state, formAction] = useFormState(confirmGeneration, initial);
  const [items, setItems] = useState<ReviewItem[]>(
    constraints.map((c) => ({ c, origin: "ai", decision: "temporary", unit_id: null }))
  );
  const [adding, setAdding] = useState(false);

  const kept = items.filter((it) => it.decision !== "discard").length;

  // Alta manual: valida con la misma logica pura del alta de la ficha y anade
  // la fila a la lista como una propuesta mas. Nada se persiste aqui.
  async function addManual(
    _prev: { error: string | null },
    formData: FormData
  ): Promise<{ error: string | null }> {
    const built = buildConstraintRow(formData);
    if (built.error) return { error: built.error };
    const row: Record<string, unknown> = { ...built.row };
    delete row.scope_type;
    delete row.scope_client_id;
    delete row.source;
    const unitId = typeof row.unit_id === "number" ? row.unit_id : null;
    delete row.unit_id;
    setItems((list) => [
      ...list,
      {
        c: row as unknown as ProposedConstraint,
        origin: "manual",
        decision: "temporary",
        unit_id: unitId,
      },
    ]);
    setAdding(false);
    return { error: null };
  }

  return (
    <Card className="flex max-w-2xl flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Review the constraints</h2>
        <p className="text-sm text-muted-foreground">
          {manual
            ? "Set the constraints for this plan by hand. Decide what to keep " +
              "on the client's profile, what to use only for this plan, and " +
              "what to drop."
            : "Decide what to keep on the client's profile, what to use only " +
              "for this plan, and what to drop. You can also add your own."}
        </p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-control border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
          {manual
            ? "No constraints yet. Add them below, or generate straight away " +
              "with the client's saved rules only."
            : "The copilot did not find any constraint it could apply. Go " +
              "back and rephrase, or add them by hand below."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border px-3 py-2.5"
            >
              <div className="flex items-center gap-2">
                <Badge variant={it.origin === "ai" ? "info" : "neutral"}>
                  {it.origin === "ai" ? "AI" : "Manual"}
                </Badge>
                <Badge variant={it.c.priority === "hard" ? "warning" : "info"}>
                  {priorityLabel(it.c.priority)}
                </Badge>
                <span className="text-sm">{proposedLabel(it.c, names)}</span>
              </div>
              <ChoiceGroup
                value={it.decision}
                onChange={(v) =>
                  setItems((list) =>
                    list.map((x, j) => (j === i ? { ...x, decision: v } : x))
                  )
                }
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

      {adding ? (
        <div className="rounded-control border border-border bg-muted/20 p-4">
          <ConstraintForm
            action={addManual}
            scopeField={
              <input type="hidden" name="client_id" value={clientId} />
            }
            onCancel={() => setAdding(false)}
            submitLabel="Add to the list"
            {...catalog}
          />
        </div>
      ) : (
        <div>
          <Button type="button" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            Add constraint
          </Button>
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="duration_days" value={durationDays} />
        <input type="hidden" name="meals_per_day" value={mealsPerDay} />
        <input type="hidden" name="items" value={JSON.stringify(items)} />

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
