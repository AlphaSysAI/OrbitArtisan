"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BookOpen, Check, Download, Loader2 } from "lucide-react";

import {
  browsePlatformCatalog,
  copyPlatformItemToLibrary,
  copyPlatformItemsToLibrary,
} from "@/lib/work-library/platform-catalog-actions";
import type { PlatformWorkItem } from "@/lib/work-library/platform-catalog-types";
import { foldSearchText, matchesPlatformItem } from "@/lib/work-library/platform-catalog-search";
import { computeDebourseSec } from "@/lib/work-library/pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatEuros } from "@/lib/format/money";

export type CatalogFamily = { id: string; label: string; count: number };

const MINE = "mine";

export function PlatformCatalogPanel({
  items: tradeItems,
  tradeLabel,
  tradeConfigured,
  families,
  libraryRefs,
  onImported,
}: {
  items: PlatformWorkItem[];
  tradeLabel: string | null;
  tradeConfigured: boolean;
  /** Familles du catalogue complet, pour les artisans polyvalents. */
  families: CatalogFamily[];
  /** Références déjà en bibliothèque (minuscules) : bouton « Ajouté » sur la ligne. */
  libraryRefs: Set<string>;
  onImported?: () => Promise<void>;
}) {
  const [scope, setScope] = React.useState<string>(tradeConfigured ? MINE : "");
  const [browsed, setBrowsed] = React.useState<PlatformWorkItem[]>([]);
  const [browsing, setBrowsing] = React.useState(false);
  const [query, setQuery] = React.useState("");

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
  const [importingId, setImportingId] = React.useState<string | null>(null);
  const [importingAll, setImportingAll] = React.useState(false);

  const filtered = React.useMemo(() => {
    const terms = foldSearchText(query).split(" ").filter(Boolean);
    return terms.length ? items.filter((item) => matchesPlatformItem(item, terms)) : items;
  }, [items, query]);

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
    if (!window.confirm(`Importer ${toImport.length} ouvrage(s) dans ta bibliothèque ?`)) return;
    setImportingAll(true);
    try {
      const res = await copyPlatformItemsToLibrary(toImport.map((i) => i.id));
      if (!res.ok) {
        toast.error("Import impossible.");
        return;
      }
      await onImported?.();
      toast.success(`${res.imported} ouvrage(s) importé(s)${res.skipped ? `, ${res.skipped} déjà présent(s)` : ""}.`);
    } finally {
      setImportingAll(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-brand/30 bg-gradient-to-br from-brand/8 via-transparent to-transparent p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BookOpen className="size-5 text-brand" />
            <h2 className="font-display text-lg font-semibold">Catalogue Soline</h2>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Ouvrages génériques — prix indicatifs marché France 2025-2026. Importe-les dans ta
            bibliothèque pour les ajuster.
          </p>
          {!tradeConfigured ? (
            <p className="text-sm">
              <Link href="/app/reglages?tab=activite" className="font-medium text-brand underline">
                Renseigne ton métier
              </Link>{" "}
              pour afficher directement les ouvrages de ton activité.
            </p>
          ) : null}
        </div>
        {toImport.length > 0 ? (
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
            Importer les {toImport.length} affichés
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
        <div className="space-y-2">
          <Label htmlFor="platform-catalog-scope">Afficher</Label>
          <select
            id="platform-catalog-scope"
            className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none"
            value={scope}
            onChange={(e) => {
              setQuery("");
              setScope(e.target.value);
            }}
          >
            {tradeConfigured ? (
              <option value={MINE}>
                Mon métier{tradeLabel ? ` — ${tradeLabel}` : ""} ({tradeItems.length})
              </option>
            ) : (
              <option value="">Choisir une famille de métiers…</option>
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
        <div className="space-y-2">
          <Label htmlFor="platform-catalog-search">Filtrer</Label>
          <Input
            id="platform-catalog-search"
            placeholder="Rechercher un ouvrage…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {browsing ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Chargement…
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {scope
            ? "Aucun ouvrage catalogue ici pour l'instant. Tu peux créer les tiens ou importer un fichier Excel / CSV."
            : "Choisis une famille de métiers pour parcourir le catalogue."}
        </p>
      ) : (
        <>

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
                        <td className="px-4 py-3 text-right tabular-nums">{formatEuros(item.unitPriceHt)}</td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
                          {formatEuros(debourse)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isInLibrary(item) ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
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
                              {importingId === item.id ? <Loader2 className="size-4 animate-spin" /> : "Importer"}
                            </Button>
                          )}
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
