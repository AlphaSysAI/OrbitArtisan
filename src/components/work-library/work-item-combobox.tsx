"use client";

import * as React from "react";
import { BookMarked, Loader2 } from "lucide-react";

import { searchWorkItems } from "@/lib/work-library/actions";
import type { WorkItemWithCategory } from "@/lib/work-library/types";
import { formatEur } from "@/lib/work-library/pricing";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function WorkItemCombobox({
  value,
  onSelect,
  placeholder = "Rechercher un ouvrage…",
  disabled,
}: {
  value: string;
  onSelect: (item: WorkItemWithCategory) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState(value);
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<WorkItemWithCategory[]>([]);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setQuery(value);
  }, [value]);

  React.useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setItems([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      const res = await searchWorkItems(q);
      setItems(res.ok ? res.items : []);
      setLoading(false);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query, open]);

  React.useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        className="pr-9"
      />
      <BookMarked className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      {open && query.trim().length >= 2 ? (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border bg-popover p-1 shadow-lg">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Recherche…
            </div>
          ) : items.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Aucun ouvrage trouvé.</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm hover:bg-muted",
                )}
                onClick={() => {
                  onSelect(item);
                  setQuery(item.title);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{item.title}</span>
                <span className="text-xs text-muted-foreground">
                  {item.reference ? `${item.reference} · ` : ""}
                  {item.unit} · {formatEur(item.unit_price_ht)} HT · TVA {item.default_vat_rate} %
                  {item.category_name ? ` · ${item.category_name}` : ""}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
