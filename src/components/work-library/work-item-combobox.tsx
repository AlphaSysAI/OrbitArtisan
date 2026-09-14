"use client";

import * as React from "react";
import { BookMarked, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { searchWorkItems } from "@/lib/work-library/actions";
import {
  copyPlatformItemToLibrary,
  searchPlatformCatalogForProfile,
} from "@/lib/work-library/platform-catalog-actions";
import { platformItemAsWorkItem } from "@/lib/work-library/platform-to-work-item";
import type { PlatformWorkItem } from "@/lib/work-library/platform-catalog-types";
import type { WorkItemWithCategory } from "@/lib/work-library/types";
import { formatEur } from "@/lib/work-library/pricing";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ComboboxOption =
  | { kind: "library"; item: WorkItemWithCategory }
  | { kind: "platform"; item: PlatformWorkItem };

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
  const [importingId, setImportingId] = React.useState<string | null>(null);
  const [options, setOptions] = React.useState<ComboboxOption[]>([]);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setQuery(value);
  }, [value]);

  React.useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setOptions([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      const [libraryRes, platformRes] = await Promise.all([
        searchWorkItems(q),
        searchPlatformCatalogForProfile(q),
      ]);

      const libraryRefs = new Set(
        (libraryRes.ok ? libraryRes.items : [])
          .map((i) => i.reference?.toLowerCase())
          .filter(Boolean),
      );

      const merged: ComboboxOption[] = [
        ...(libraryRes.ok ? libraryRes.items.map((item) => ({ kind: "library" as const, item })) : []),
        ...(platformRes.ok
          ? platformRes.items
              .filter((p) => !libraryRefs.has(p.reference.toLowerCase()))
              .map((item) => ({ kind: "platform" as const, item }))
          : []),
      ];

      setOptions(merged);
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

  async function handlePlatformSelect(platformItem: PlatformWorkItem) {
    setImportingId(platformItem.id);
    const res = await copyPlatformItemToLibrary(platformItem.id);
    setImportingId(null);

    if (res.ok) {
      onSelect(platformItemAsWorkItem(platformItem, res.workItemId));
      setQuery(platformItem.title);
      setOpen(false);
      return;
    }

    if (res.error === "already_imported" && res.existingId && res.item) {
      onSelect(platformItemAsWorkItem(res.item, res.existingId));
      setQuery(res.item.title);
      setOpen(false);
      return;
    }

    if (res.error === "forbidden_trade") {
      toast.error("Ouvrage non disponible pour ton métier.");
    } else {
      toast.error("Impossible d'ajouter cet ouvrage.");
    }
  }

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
          ) : options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Aucun ouvrage trouvé.</p>
          ) : (
            options.map((opt) => {
              if (opt.kind === "library") {
                const item = opt.item;
                return (
                  <button
                    key={`lib-${item.id}`}
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
                );
              }

              const item = opt.item;
              const busy = importingId === item.id;
              return (
                <button
                  key={`plat-${item.id}`}
                  type="button"
                  disabled={busy}
                  className={cn(
                    "flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm hover:bg-muted",
                    busy && "opacity-60",
                  )}
                  onClick={() => void handlePlatformSelect(item)}
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-brand" />}
                    {item.title}
                    <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
                      Catalogue
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.reference} · {item.unit} · {formatEur(item.unitPriceHt)} HT · TVA{" "}
                    {item.defaultVatRate} % · {item.workCategory}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
