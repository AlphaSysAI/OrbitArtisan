"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BookOpen, Download, Loader2, Sparkles } from "lucide-react";

import {
  copyAllPlatformCatalogToLibrary,
  copyPlatformItemToLibrary,
} from "@/lib/work-library/platform-catalog-actions";
import type { PlatformWorkItem } from "@/lib/work-library/platform-catalog-types";
import { computeDebourseSec, formatEur } from "@/lib/work-library/pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export function PlatformCatalogPanel({
  items,
  tradeLabel,
  tradeConfigured,
  onImported,
}: {
  items: PlatformWorkItem[];
  tradeLabel: string | null;
  tradeConfigured: boolean;
  onImported?: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [importingId, setImportingId] = React.useState<string | null>(null);
  const [importingAll, setImportingAll] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.reference.toLowerCase().includes(q) ||
        item.workCategory.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q),
    );
  }, [items, query]);

  async function handleCopyOne(id: string) {
    setImportingId(id);
    const res = await copyPlatformItemToLibrary(id);
    setImportingId(null);
    if (!res.ok) {
      if (res.error === "already_imported") {
        toast.message("Déjà dans ta bibliothèque", {
          description: "Cet ouvrage a déjà été importé (même référence).",
        });
      } else if (res.error === "forbidden_trade") {
        toast.error("Ouvrage non disponible pour ton métier.");
      } else {
        toast.error("Import impossible.");
      }
      return;
    }
    toast.success("Ouvrage ajouté à ta bibliothèque.");
    onImported?.();
  }

  async function handleCopyAll() {
    if (!window.confirm(`Importer les ${items.length} ouvrages Soline dans ta bibliothèque ?`)) return;
    setImportingAll(true);
    const res = await copyAllPlatformCatalogToLibrary();
    setImportingAll(false);
    if (!res.ok) {
      toast.error("Import impossible.");
      return;
    }
    toast.success(`${res.imported} ouvrage(s) importé(s)${res.skipped ? `, ${res.skipped} ignoré(s)` : ""}.`);
    onImported?.();
  }

  if (!tradeConfigured) {
    return (
      <section className="rounded-2xl border border-dashed border-brand/40 bg-brand/5 p-6">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-brand" />
          <div className="space-y-2">
            <h2 className="font-display text-lg font-semibold">Catalogue Soline par métier</h2>
            <p className="text-sm text-muted-foreground">
              Renseigne ton métier dans les réglages pour afficher les ouvrages génériques adaptés à
              ton activité.
            </p>
            <Link href="/app/reglages?tab=activite" className={buttonVariants({ size: "sm" })}>
              Configurer mon métier
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-brand/30 bg-gradient-to-br from-brand/8 via-transparent to-transparent p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BookOpen className="size-5 text-brand" />
            <h2 className="font-display text-lg font-semibold">Catalogue Soline</h2>
          </div>
          {tradeLabel ? (
            <p className="text-sm font-medium text-brand">{tradeLabel}</p>
          ) : null}
          <p className="max-w-2xl text-sm text-muted-foreground">
            {items.length} ouvrage(s) générique(s) pour ton métier — prix indicatifs marché France
            2025-2026. Importe-les dans ta bibliothèque pour les ajuster.
          </p>
        </div>
        {items.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            className="shrink-0 border-brand/30"
            disabled={importingAll}
            onClick={() => void handleCopyAll()}
          >
            {importingAll ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Download className="mr-2 size-4" />
            )}
            Tout importer
          </Button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun ouvrage catalogue pour ce métier pour l&apos;instant. Tu peux créer les tiens ou
          importer un CSV.
        </p>
      ) : (
        <>
          <div className="max-w-md space-y-2">
            <Label htmlFor="platform-catalog-search">Filtrer le catalogue</Label>
            <Input
              id="platform-catalog-search"
              placeholder="Rechercher un ouvrage…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border bg-card/80">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Ouvrage</th>
                  <th className="px-4 py-3 font-semibold">Famille</th>
                  <th className="px-4 py-3 font-semibold">Unité</th>
                  <th className="px-4 py-3 font-semibold text-right">Prix HT</th>
                  <th className="px-4 py-3 font-semibold text-right">MO / Mat.</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      Aucun résultat pour cette recherche.
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => {
                    const debourse = computeDebourseSec(item.materialCost, item.laborCost);
                    return (
                      <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <div className="font-medium">{item.title}</div>
                          <div className="text-xs text-muted-foreground">{item.reference}</div>
                          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {item.description}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{item.workCategory}</td>
                        <td className="px-4 py-3">{item.unit}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatEur(item.unitPriceHt)}</td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
                          {formatEur(debourse)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={importingId === item.id}
                            onClick={() => void handleCopyOne(item.id)}
                          >
                            {importingId === item.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              "Importer"
                            )}
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <p className={cn("text-xs text-muted-foreground")}>
            Prix indicatifs — à valider selon ta zone, tes fournisseurs et tes marges. Les ouvrages
            importés deviennent modifiables dans « Ma bibliothèque » ci-dessous.
          </p>
        </>
      )}
    </section>
  );
}
