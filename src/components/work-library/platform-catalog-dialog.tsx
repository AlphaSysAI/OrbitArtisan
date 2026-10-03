"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Download, Loader2 } from "lucide-react";

import {
  browsePlatformCatalog,
  copyPlatformItemToLibrary,
  copyPlatformItemsToLibrary,
} from "@/lib/work-library/platform-catalog-actions";
import type { PlatformWorkItem } from "@/lib/work-library/platform-catalog-types";
import { foldSearchText, matchesPlatformItem } from "@/lib/work-library/platform-catalog-search";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatEuros } from "@/lib/format/money";

export type CatalogFamily = { id: string; label: string; count: number };

const MINE = "mine";

type SortKey = "family" | "az" | "price-asc" | "price-desc";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "family", label: "Par famille d'ouvrage" },
  { value: "az", label: "Désignation A → Z" },
  { value: "price-asc", label: "Prix croissant" },
  { value: "price-desc", label: "Prix décroissant" },
];

const selectClass =
  "flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function sortItems(items: PlatformWorkItem[], sort: SortKey): PlatformWorkItem[] {
  const copy = [...items];
  const byTitle = (a: PlatformWorkItem, b: PlatformWorkItem) => a.title.localeCompare(b.title, "fr");
  switch (sort) {
    case "az":
      return copy.sort(byTitle);
    case "price-asc":
      return copy.sort((a, b) => a.unitPriceHt - b.unitPriceHt || byTitle(a, b));
    case "price-desc":
      return copy.sort((a, b) => b.unitPriceHt - a.unitPriceHt || byTitle(a, b));
    default:
      return copy.sort((a, b) => a.workCategory.localeCompare(b.workCategory, "fr") || byTitle(a, b));
  }
}

/**
 * Catalogue Soline en fenêtre flottante : métier de l'artisan par défaut, toute famille au choix,
 * filtres (famille d'ouvrage, recherche) et tri. Reste monté une fois fermé : l'artisan
 * retrouve ses filtres et sa position à la réouverture.
 */
export function PlatformCatalogDialog({
  open,
  onOpenChange,
  items: tradeItems,
  tradeLabel,
  tradeConfigured,
  families,
  libraryRefs,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PlatformWorkItem[];
  tradeLabel: string | null;
  tradeConfigured: boolean;
  families: CatalogFamily[];
  /** Références déjà en bibliothèque (minuscules) : ligne marquée « Ajouté ». */
  libraryRefs: Set<string>;
  onImported?: () => Promise<void>;
}) {
  const [scope, setScope] = React.useState<string>(tradeConfigured ? MINE : "");
  const [browsed, setBrowsed] = React.useState<PlatformWorkItem[]>([]);
  const [browsing, setBrowsing] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [workCategory, setWorkCategory] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("family");
  const [importingId, setImportingId] = React.useState<string | null>(null);
  const [importingAll, setImportingAll] = React.useState(false);

  React.useEffect(() => {
    if (!scope || scope === MINE) return;
    let cancelled = false;
    setBrowsing(true);
    void browsePlatformCatalog(scope).then((res) => {
      if (cancelled) return;
      setBrowsing(false);
      setBrowsed(res.ok ? res.items : []);
      if (!res.ok) toast.error("Catalogue indisponible.");
    });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const items = React.useMemo(
    () => (scope === MINE ? tradeItems : scope ? browsed : []),
    [scope, tradeItems, browsed],
  );

  const workCategories = React.useMemo(
    () => [...new Set(items.map((i) => i.workCategory))].sort((a, b) => a.localeCompare(b, "fr")),
    [items],
  );

  const filtered = React.useMemo(() => {
    const terms = foldSearchText(query).split(" ").filter(Boolean);
    const visible = items.filter(
      (item) =>
        (!workCategory || item.workCategory === workCategory) &&
        (terms.length === 0 || matchesPlatformItem(item, terms)),
    );
    return sortItems(visible, sort);
  }, [items, query, workCategory, sort]);

  const isInLibrary = React.useCallback(
    (item: PlatformWorkItem) => libraryRefs.has(item.reference.trim().toLowerCase()),
    [libraryRefs],
  );
  const toImport = React.useMemo(() => filtered.filter((i) => !isInLibrary(i)), [filtered, isInLibrary]);

  // Le spinner reste jusqu'à la resynchro de la bibliothèque : la ligne passe directement à « Ajouté ».
  async function handleCopyOne(id: string) {
    setImportingId(id);
    try {
      const res = await copyPlatformItemToLibrary(id);
      if (!res.ok && res.error !== "already_imported") {
        toast.error("Import impossible.");
        return;
      }
      await onImported?.();
      if (res.ok) toast.success("Ouvrage ajouté à ta bibliothèque.");
    } finally {
      setImportingId(null);
    }
  }

  async function handleCopyAll() {
    if (!window.confirm(`Ajouter ${toImport.length} ouvrage(s) à ta bibliothèque ?`)) return;
    setImportingAll(true);
    try {
      const res = await copyPlatformItemsToLibrary(toImport.map((i) => i.id));
      if (!res.ok) {
        toast.error("Import impossible.");
        return;
      }
      await onImported?.();
      toast.success(`${res.imported} ouvrage(s) ajouté(s)${res.skipped ? `, ${res.skipped} déjà présent(s)` : ""}.`);
    } finally {
      setImportingAll(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        keepMounted
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 rounded-none p-0 sm:h-[88vh] sm:max-w-5xl sm:rounded-xl"
      >
        <div className="space-y-4 border-b p-4 sm:p-5">
          <DialogHeader className="pr-8">
            <DialogTitle className="font-display text-lg">Catalogue Soline</DialogTitle>
            <DialogDescription>
              Ouvrages génériques, prix indicatifs France 2025-2026 à ajuster à ta zone et tes fournisseurs.
              {!tradeConfigured ? (
                <>
                  {" "}
                  <Link href="/app/reglages?tab=activite" className="font-medium text-brand underline">
                    Renseigne ton métier
                  </Link>{" "}
                  pour ouvrir directement sur ton activité.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="catalog-scope">Métiers</Label>
              <select
                id="catalog-scope"
                className={selectClass}
                value={scope}
                onChange={(e) => {
                  setWorkCategory("");
                  setScope(e.target.value);
                }}
              >
                {tradeConfigured ? (
                  <option value={MINE}>
                    Mon métier{tradeLabel ? ` — ${tradeLabel}` : ""} ({tradeItems.length})
                  </option>
                ) : (
                  <option value="">Choisir une famille…</option>
                )}
                <optgroup label="Tout le catalogue">
                  {families.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label} ({f.count})
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="catalog-work-category">Famille d&apos;ouvrage</Label>
              <select
                id="catalog-work-category"
                className={selectClass}
                value={workCategory}
                onChange={(e) => setWorkCategory(e.target.value)}
                disabled={workCategories.length === 0}
              >
                <option value="">Toutes</option>
                {workCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="catalog-sort">Trier</Label>
              <select
                id="catalog-sort"
                className={selectClass}
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="catalog-search">Rechercher</Label>
              <Input
                id="catalog-search"
                type="search"
                placeholder="ex. dalle béton 15"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {filtered.length} ouvrage(s)
              {filtered.length > toImport.length ? ` · ${filtered.length - toImport.length} déjà dans ta bibliothèque` : ""}
            </p>
            {toImport.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={importingAll}
                onClick={() => void handleCopyAll()}
              >
                {importingAll ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
                Tout ajouter ({toImport.length})
              </Button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {browsing ? (
            <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Chargement…
            </p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {!scope
                ? "Choisis une famille de métiers pour parcourir le catalogue."
                : items.length === 0
                  ? "Aucun ouvrage catalogue ici pour l'instant."
                  : "Aucun résultat avec ces filtres."}
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map((item) => {
                const added = isInLibrary(item);
                return (
                  <li key={item.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug">{item.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.workCategory} · {item.reference} · TVA {String(item.defaultVatRate).replace(".", ",")} %
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums">{formatEuros(item.unitPriceHt)}</p>
                      <p className="text-xs text-muted-foreground">HT / {item.unit}</p>
                    </div>
                    <div className="w-24 shrink-0 text-right">
                      {added ? (
                        <span className="inline-flex h-8 items-center gap-1 text-xs font-medium text-success">
                          <Check className="size-4" /> Ajouté
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={importingId === item.id || importingAll}
                          onClick={() => void handleCopyOne(item.id)}
                        >
                          {importingId === item.id ? <Loader2 className="size-4 animate-spin" /> : "Ajouter"}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
