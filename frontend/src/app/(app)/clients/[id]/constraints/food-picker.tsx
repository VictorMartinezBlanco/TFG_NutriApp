"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

type FoodOption = { id: number; name_en: string; name_es: string };

// Buscador de alimentos con resultados server-side. Guarda la seleccion en un
// input oculto con el name dado, para que entre en el FormData del alta.
export function FoodPicker({
  name,
  label,
  placeholder = "Search food",
}: {
  name: string;
  label?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodOption[]>([]);
  const [selected, setSelected] = useState<FoodOption | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/foods/search?q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal }
        );
        const data = await res.json();
        setResults(data.foods ?? []);
        setOpen(true);
      } catch {
        // request cancelada o fallida: se ignora, el usuario reintenta.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, selected]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pick(food: FoodOption) {
    setSelected(food);
    setOpen(false);
    setQuery("");
  }

  function clear() {
    setSelected(null);
    setQuery("");
    setResults([]);
  }

  return (
    <div className="flex flex-col gap-1.5" ref={boxRef}>
      {label && (
        <span className="text-sm font-medium">
          {label}
          <span className="text-danger"> *</span>
        </span>
      )}
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-control border border-input bg-card px-3 py-2 text-sm">
          <span>{selected.name_en}</span>
          <button
            type="button"
            onClick={clear}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Clear selection"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
            placeholder={placeholder}
            className="pl-9"
            autoComplete="off"
          />
          {open && results.length > 0 && (
            <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-control border border-border bg-card p-1 shadow-card">
              {results.map((food) => (
                <li key={food.id}>
                  <button
                    type="button"
                    onClick={() => pick(food)}
                    className="w-full rounded-control px-3 py-1.5 text-left text-sm hover:bg-brand-soft hover:text-brand"
                  >
                    {food.name_en}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {open && query.trim().length >= 2 && results.length === 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-control border border-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-card">
              No foods found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
