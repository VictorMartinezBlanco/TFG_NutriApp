"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { replaceAvailability, type AvailabilityState } from "./_actions";

export type AvailabilityBlock = { day: number; start: string; end: string };

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const initialState: AvailabilityState = { error: null, ok: false };

type Block = { id: number; start: string; end: string };

export function AvailabilityEditor({ blocks }: { blocks: AvailabilityBlock[] }) {
  const [state, formAction] = useFormState(replaceAvailability, initialState);

  // Estado local: por dia, una lista de bloques con un id de fila para el key.
  const seed = React.useMemo(() => {
    const byDay: Block[][] = Array.from({ length: 7 }, () => []);
    let counter = 0;
    for (const b of blocks) {
      if (b.day >= 0 && b.day <= 6) {
        byDay[b.day].push({ id: counter++, start: b.start, end: b.end });
      }
    }
    return byDay;
  }, [blocks]);

  const [days, setDays] = React.useState<Block[][]>(seed);
  const nextId = React.useRef(1000);

  const addBlock = (day: number) => {
    setDays((prev) => {
      const copy = prev.map((d) => [...d]);
      copy[day].push({ id: nextId.current++, start: "09:00", end: "13:00" });
      return copy;
    });
  };

  const removeBlock = (day: number, id: number) => {
    setDays((prev) => {
      const copy = prev.map((d) => [...d]);
      copy[day] = copy[day].filter((b) => b.id !== id);
      return copy;
    });
  };

  const updateBlock = (day: number, id: number, field: "start" | "end", value: string) => {
    setDays((prev) => {
      const copy = prev.map((d) => [...d]);
      copy[day] = copy[day].map((b) => (b.id === id ? { ...b, [field]: value } : b));
      return copy;
    });
  };

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Set the hours you are available each day. Clients book within these blocks.
      </p>

      <div className="flex flex-col gap-4">
        {DAY_LABELS.map((label, day) => (
          <div key={day} className="flex flex-col gap-2 border-b border-border pb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{label}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => addBlock(day)}
              >
                <Plus className="size-4" />
                Add block
              </Button>
            </div>
            {days[day].length === 0 ? (
              <span className="text-sm text-muted-foreground">No blocks</span>
            ) : (
              <div className="flex flex-col gap-2">
                {days[day].map((b) => (
                  <div key={b.id} className="flex items-center gap-2">
                    <input type="hidden" name="block_day" value={day} />
                    <input
                      type="time"
                      name="block_start"
                      value={b.start}
                      onChange={(e) => updateBlock(day, b.id, "start", e.target.value)}
                      className="h-9 rounded-control border border-input bg-card px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <span className="text-muted-foreground">to</span>
                    <input
                      type="time"
                      name="block_end"
                      value={b.end}
                      onChange={(e) => updateBlock(day, b.id, "end", e.target.value)}
                      className="h-9 rounded-control border border-input bg-card px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <button
                      type="button"
                      onClick={() => removeBlock(day, b.id)}
                      className="text-muted-foreground hover:text-danger"
                      aria-label="Remove block"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {state.error && (
        <p className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-control bg-brand-soft px-3 py-2 text-sm text-brand">
          Availability saved.
        </p>
      )}

      <div>
        <SaveButton />
      </div>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving..." : "Save availability"}
    </Button>
  );
}
