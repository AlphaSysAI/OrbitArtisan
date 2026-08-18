"use client";

import * as React from "react";
import { toast } from "sonner";
import { Download, Pencil, Plus, Trash2, Upload } from "lucide-react";

import {
  deleteWorkItem,
  exportWorkItemsCsv,
  importWorkItemsCsv,
  listWorkItems,
} from "@/lib/work-library/actions";
import { computeDebourseSec, formatEur } from "@/lib/work-library/pricing";
import type { WorkCategory, WorkItemWithCategory } from "@/lib/work-library/types";
import { WorkItemFormDialog } from "@/components/work-library/work-item-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function WorkLibraryManager({
  initialItems,
  categories,
  defaultHourlyRateHt,
}: {
  initialItems: WorkItemWithCategory[];
  categories: WorkCategory[];
  defaultHourlyRateHt: number;
}) {
  const [items, setItems] = React.useState(initialItems);
  const [query, setQuery] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<WorkItemWithCategory | null>(null);
  const [importing, setImporting] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryFilter && item.category_id !== categoryFilter) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        (item.reference?.toLowerCase().includes(q) ?? false) ||
        (item.description?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, query, categoryFilter]);

  async function refresh() {
    const res = await listWorkItems({ q: query, categoryId: categoryFilter || null });
    if (res.ok) setItems(res.items);
  }

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

  async function handleImportFile(file: File) {
    setImporting(true);
    const text = await file.text();
    const res = await importWorkItemsCsv(text);
    setImporting(false);
    if (!res.ok) {
      toast.error("Import impossible — vérifie le format CSV.");
      return;
    }
    toast.success(`${res.imported} ouvrage(s) importé(s).`);
    if (res.parseErrors.length) {
      toast.warning(res.parseErrors.slice(0, 3).join(" · "));
    }
    await refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:max-w-xl">
          <div className="space-y-2">
            <Label htmlFor="lib-search">Recherche</Label>
            <Input
              id="lib-search"
              placeholder="Titre, référence, mot-clé…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lib-cat">Catégorie</Label>
            <select
              id="lib-cat"
              className={cn(
                "flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none",
              )}
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
        </div>
        <div className="flex flex-wrap gap-2">
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
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
            <Upload className="mr-2 size-4" />
            {importing ? "Import…" : "Importer CSV"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
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
              <th className="px-4 py-3 font-semibold">Titre</th>
              <th className="px-4 py-3 font-semibold">Catégorie</th>
              <th className="px-4 py-3 font-semibold">Unité</th>
              <th className="px-4 py-3 font-semibold text-right">Prix HT</th>
              <th className="px-4 py-3 font-semibold text-right">TVA</th>
              <th className="px-4 py-3 font-semibold text-right">Déboursé</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  Aucun ouvrage. Ajoute-en un ou importe un CSV.
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                const debourse = computeDebourseSec(item.material_cost, item.labor_cost);
                return (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.title}</div>
                      {item.reference ? (
                        <div className="text-xs text-muted-foreground">{item.reference}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{item.category_name ?? "—"}</td>
                    <td className="px-4 py-3">{item.unit}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatEur(item.unit_price_ht)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{item.default_vat_rate} %</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatEur(debourse)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
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
