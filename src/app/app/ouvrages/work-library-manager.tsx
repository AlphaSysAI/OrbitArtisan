"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckSquare,
  Download,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { deleteWorkItem, deleteWorkItems, exportWorkItemsCsv } from "@/lib/work-library/actions";
import { computeDebourseSec } from "@/lib/work-library/pricing";
import { foldSearchText } from "@/lib/work-library/platform-catalog-search";
import {
  DEFAULT_WORK_ITEM_SORT,
  isWorkItemSort,
  nextSort,
  sortWorkItems,
  type WorkItemSort,
  type WorkItemSortKey,
} from "@/lib/work-library/sort-work-items";
import type { WorkCategory, WorkItemWithCategory } from "@/lib/work-library/types";
import { WorkItemFormDialog } from "@/components/work-library/work-item-form-dialog";
import { WorkItemsImportDialog } from "@/components/work-library/work-items-import-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatEuros } from "@/lib/format/money";

const SORT_STORAGE_KEY = "soline:ouvrages:sort";

const COLUMNS: { key: WorkItemSortKey; label: string; align?: "right" }[] = [
  { key: "title", label: "Titre" },
  { key: "category", label: "Catégorie" },
  { key: "unit", label: "Unité" },
  { key: "price", label: "Prix HT", align: "right" },
  { key: "vat", label: "TVA", align: "right" },
  { key: "debourse", label: "Déboursé", align: "right" },
];

/** Options du sélecteur de tri mobile (les en-têtes de colonnes sont peu cliquables sur téléphone). */
const MOBILE_SORTS: { value: string; label: string; sort: WorkItemSort }[] = [
  { value: "title-asc", label: "Titre A → Z", sort: { key: "title", dir: "asc" } },
  { value: "title-desc", label: "Titre Z → A", sort: { key: "title", dir: "desc" } },
  { value: "created-desc", label: "Ajoutés récemment", sort: { key: "created", dir: "desc" } },
  { value: "category-asc", label: "Catégorie", sort: { key: "category", dir: "asc" } },
  { value: "price-asc", label: "Prix croissant", sort: { key: "price", dir: "asc" } },
  { value: "price-desc", label: "Prix décroissant", sort: { key: "price", dir: "desc" } },
];

const selectClass = "flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none";

function readStoredSort(): WorkItemSort {
  try {
    const raw = window.localStorage.getItem(SORT_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isWorkItemSort(parsed) ? parsed : DEFAULT_WORK_ITEM_SORT;
  } catch {
    return DEFAULT_WORK_ITEM_SORT;
  }
}

/** Bibliothèque de l'artisan : état détenu par le parent pour rester synchro avec le catalogue Soline. */
export function WorkLibraryManager({
  items,
  setItems,
  categories,
  onRefresh,
  freshIds,
  dropEpoch,
  defaultHourlyRateHt,
}: {
  items: WorkItemWithCategory[];
  setItems: React.Dispatch<React.SetStateAction<WorkItemWithCategory[]>>;
  categories: WorkCategory[];
  /** Recharge bibliothèque + catégories (après import, création, modification). */
  onRefresh: () => Promise<void>;
  /** Ouvrages tout juste ajoutés : animation « feuille déposée ». */
  freshIds: ReadonlySet<string>;
  /** Change à chaque dépôt : remonte les lignes fraîches pour rejouer l'animation. */
  dropEpoch: number;
  defaultHourlyRateHt: number;
}) {
  const [query, setQuery] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const [sort, setSort] = React.useState<WorkItemSort>(DEFAULT_WORK_ITEM_SORT);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<WorkItemWithCategory | null>(null);
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const closeImport = React.useCallback(() => setImportFile(null), []);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Sélection multiple
  const [selecting, setSelecting] = React.useState(false);
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(() => new Set());
  const [deleting, setDeleting] = React.useState(false);

  // Tri mémorisé par appareil (préférence de confort, jamais bloquante).
  React.useEffect(() => {
    setSort(readStoredSort());
  }, []);

  function applySort(next: WorkItemSort) {
    setSort(next);
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // stockage indisponible (navigation privée) : tri non mémorisé
    }
  }

  const filtered = React.useMemo(() => {
    const terms = foldSearchText(query).split(" ").filter(Boolean);
    const visible = items.filter((item) => {
      if (categoryFilter && item.category_id !== categoryFilter) return false;
      if (terms.length === 0) return true;
      const haystack = foldSearchText(`${item.title} ${item.reference ?? ""} ${item.description ?? ""}`);
      return terms.every((t) => haystack.includes(t));
    });
    return sortWorkItems(visible, sort);
  }, [items, query, categoryFilter, sort]);

  // Seuls les ouvrages visibles comptent : un filtre ne doit jamais faire supprimer une ligne cachée.
  const visibleSelected = React.useMemo(
    () => filtered.filter((i) => selected.has(i.id)).map((i) => i.id),
    [filtered, selected],
  );
  const allVisibleSelected = filtered.length > 0 && visibleSelected.length === filtered.length;
  const someVisibleSelected = visibleSelected.length > 0 && !allVisibleSelected;

  const headerCheckboxRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = someVisibleSelected;
  }, [someVisibleSelected, selecting]);

  const exitSelection = React.useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
  }, []);

  React.useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !dialogOpen) exitSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting, dialogOpen, exitSelection]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected(allVisibleSelected ? new Set() : new Set(filtered.map((i) => i.id)));
  }

  const refresh = onRefresh;

  const freshOrder = React.useMemo(() => {
    const order = new Map<string, number>();
    for (const item of filtered) if (freshIds.has(item.id)) order.set(item.id, order.size);
    return order;
  }, [filtered, freshIds]);

  async function handleDelete(id: string) {
    if (!window.confirm("Supprimer cet ouvrage ?")) return;
    const res = await deleteWorkItem(id);
    if (!res.ok) {
      toast.error("Suppression impossible.");
      return;
    }
    toast.success("Ouvrage supprimé.");
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function handleBulkDelete() {
    const ids = visibleSelected;
    if (ids.length === 0) return;
    if (!window.confirm(`Supprimer ${ids.length} ouvrage(s) de ta bibliothèque ? Les devis déjà faits ne sont pas modifiés.`)) {
      return;
    }
    setDeleting(true);
    try {
      const res = await deleteWorkItems(ids);
      if (!res.ok) {
        toast.error("Suppression impossible.");
        return;
      }
      const gone = new Set(res.deletedIds);
      setItems((prev) => prev.filter((i) => !gone.has(i.id)));
      toast.success(`${res.deleted} ouvrage(s) supprimé(s).`);
      exitSelection();
    } finally {
      setDeleting(false);
    }
  }

  async function handleExport() {
    const res = await exportWorkItemsCsv();
    if (!res.ok) {
      toast.error("Export impossible.");
      return;
    }
    const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bibliotheque-ouvrages-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const mobileSortValue = MOBILE_SORTS.find((o) => o.sort.key === sort.key && o.sort.dir === sort.dir)?.value ?? "";
  const colSpan = COLUMNS.length + 1 + (selecting ? 1 : 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:max-w-xl">
          <div className="space-y-2">
            <Label htmlFor="lib-search">Recherche</Label>
            <Input
              id="lib-search"
              type="search"
              placeholder="Titre, référence, mot-clé…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lib-cat">Catégorie</Label>
            <select
              id="lib-cat"
              className={selectClass}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">Toutes</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 sm:hidden">
            <Label htmlFor="lib-sort">Trier</Label>
            <select
              id="lib-sort"
              className={selectClass}
              value={mobileSortValue}
              onChange={(e) => {
                const option = MOBILE_SORTS.find((o) => o.value === e.target.value);
                if (option) applySort(option.sort);
              }}
            >
              {mobileSortValue ? null : <option value="">Tri personnalisé</option>}
              {MOBILE_SORTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={selecting ? "secondary" : "outline"}
            onClick={() => (selecting ? exitSelection() : setSelecting(true))}
            disabled={items.length === 0}
          >
            {selecting ? <X className="mr-2 size-4" /> : <CheckSquare className="mr-2 size-4" />}
            {selecting ? "Annuler la sélection" : "Sélectionner"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 size-4" />
            Ajouter
          </Button>
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-2 size-4" />
            Importer Excel / CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setImportFile(file);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" onClick={() => void handleExport()}>
            <Download className="mr-2 size-4" />
            Exporter CSV
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              {selecting ? (
                <th className="w-10 px-4 py-3">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    className="size-4 cursor-pointer accent-brand"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label={allVisibleSelected ? "Tout désélectionner" : "Tout sélectionner"}
                  />
                </th>
              ) : null}
              {COLUMNS.map((col) => {
                const active = sort.key === col.key;
                const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={col.key}
                    className={cn("px-4 py-3 font-semibold", col.align === "right" && "text-right")}
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <button
                      type="button"
                      onClick={() => applySort(nextSort(sort, col.key))}
                      className={cn(
                        "inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-foreground",
                        active && "text-foreground",
                      )}
                    >
                      {col.label}
                      <Icon className={cn("size-3.5", !active && "opacity-40")} />
                    </button>
                  </th>
                );
              })}
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-10 text-center text-muted-foreground">
                  {items.length === 0
                    ? "Aucun ouvrage pour l'instant. Pioche dans notre catalogue, crée le tien ou importe ton fichier Excel / CSV."
                    : "Aucun ouvrage ne correspond à ces filtres."}
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                // Ajout en lot : dépôt en cascade, plafonné pour ne pas faire attendre.
                const freshRank = freshIds.has(item.id) ? freshOrder.get(item.id) ?? 0 : -1;
                const debourse = computeDebourseSec(item.material_cost, item.labor_cost);
                const isSelected = selecting && selected.has(item.id);
                return (
                  <tr
                    key={freshRank >= 0 ? `${item.id}-${dropEpoch}` : item.id}
                    data-fresh-sheet={freshRank === 0 ? "true" : undefined}
                    aria-selected={selecting ? isSelected : undefined}
                    onClick={selecting ? () => toggleOne(item.id) : undefined}
                    className={cn(
                      "border-b last:border-0 hover:bg-muted/20",
                      selecting && "cursor-pointer select-none",
                      isSelected && "bg-brand/8 hover:bg-brand/12",
                      freshRank >= 0 && "animate-sheet-drop",
                    )}
                    style={
                      freshRank >= 0
                        ? {
                            animationDelay: `${Math.min(freshRank * 60, 900)}ms, ${Math.min(freshRank * 60, 900) + 400}ms`,
                          }
                        : undefined
                    }
                  >
                    {selecting ? (
                      <td className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          className="size-4 cursor-pointer accent-brand"
                          checked={isSelected}
                          onChange={() => toggleOne(item.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Sélectionner ${item.title}`}
                        />
                      </td>
                    ) : null}
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.title}</div>
                      {item.reference ? <div className="text-xs text-muted-foreground">{item.reference}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{item.category_name ?? "—"}</td>
                    <td className="px-4 py-3">{item.unit}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatEuros(item.unit_price_ht)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{item.default_vat_rate} %</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatEuros(debourse)}</td>
                    <td className="px-4 py-3">
                      <div className={cn("flex justify-end gap-1", selecting && "invisible")}>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Modifier"
                          onClick={() => {
                            setEditing(item);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Supprimer"
                          onClick={() => void handleDelete(item.id)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selecting ? (
        <div
          role="toolbar"
          aria-label="Actions sur la sélection"
          className="sticky bottom-4 z-20 mx-auto flex w-full max-w-xl flex-wrap items-center justify-between gap-2 rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur supports-backdrop-filter:bg-background/80"
        >
          <p className="pl-1 text-sm font-medium">
            {visibleSelected.length} sélectionné(s)
            {!allVisibleSelected && filtered.length > 0 ? (
              <button type="button" onClick={toggleAllVisible} className="ml-2 text-brand underline">
                Tout sélectionner ({filtered.length})
              </button>
            ) : null}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={exitSelection} disabled={deleting}>
              Annuler
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => void handleBulkDelete()}
              disabled={visibleSelected.length === 0 || deleting}
            >
              {deleting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
              Supprimer
            </Button>
          </div>
        </div>
      ) : null}

      <WorkItemsImportDialog file={importFile} onClose={closeImport} onImported={() => void refresh()} />

      <WorkItemFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            void refresh();
          }
        }}
        categories={categories}
        item={editing}
        defaultHourlyRateHt={defaultHourlyRateHt}
      />
    </div>
  );
}
