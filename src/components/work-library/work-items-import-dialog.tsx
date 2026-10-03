"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { analyzeWorkItemsFile, importWorkItemsFile } from "@/lib/work-library/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatEuros } from "@/lib/format/money";

type Analysis = Extract<Awaited<ReturnType<typeof analyzeWorkItemsFile>>, { ok: true }>;

const FIELD_LABELS: Record<string, string> = {
  reference: "Référence",
  title: "Désignation",
  description: "Description",
  category: "Catégorie",
  unit: "Unité",
  unit_price_ht: "Prix HT",
  default_vat_rate: "TVA",
  labor_cost: "Coût MO",
  material_cost: "Coût fournitures",
  estimated_hours: "Heures",
};

const FILE_ERRORS: Record<string, string> = {
  no_file: "Aucun fichier sélectionné.",
  too_large: "Fichier trop lourd (4 Mo maximum).",
  xls_unsupported: "Ancien format Excel (.xls) : enregistre le fichier en .xlsx ou .csv.",
  unreadable: "Fichier illisible : vérifie qu'il s'agit bien d'un .xlsx ou d'un .csv.",
  empty: "Aucune ligne exploitable : il faut au moins une colonne « Désignation ».",
  insert_failed: "Enregistrement impossible, réessaie.",
};

/** Sélection d'un fichier → aperçu (colonnes reconnues, 5 lignes, alertes) → import confirmé. */
export function WorkItemsImportDialog({
  file,
  onClose,
  onImported,
}: {
  file: File | null;
  onClose: () => void;
  onImported: () => void;
}) {
  const [analysis, setAnalysis] = React.useState<Analysis | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [importing, setImporting] = React.useState(false);

  React.useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setAnalysis(null);
    setLoading(true);
    const fd = new FormData();
    fd.set("file", file);
    void analyzeWorkItemsFile(fd).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        toast.error(FILE_ERRORS[res.error] ?? "Import impossible.");
        onClose();
        return;
      }
      setAnalysis(res);
    });
    return () => {
      cancelled = true;
    };
  }, [file, onClose]);

  async function confirm() {
    if (!file) return;
    setImporting(true);
    const fd = new FormData();
    fd.set("file", file);
    const res = await importWorkItemsFile(fd);
    setImporting(false);
    if (!res.ok) {
      toast.error(FILE_ERRORS[res.error] ?? "Import impossible.");
      return;
    }
    toast.success(
      `${res.imported} ouvrage(s) importé(s)${res.skipped ? `, ${res.skipped} doublon(s) ignoré(s)` : ""}.`,
    );
    onImported();
    onClose();
  }

  const columns = analysis ? Object.entries(analysis.detectedColumns) : [];

  return (
    <Dialog open={file != null} onOpenChange={(open) => !open && !importing && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importer {file?.name ?? "un fichier"}</DialogTitle>
          <DialogDescription>Vérifie les colonnes et les premières lignes avant d&apos;importer.</DialogDescription>
        </DialogHeader>

        {loading || !analysis ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Analyse du fichier…
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="font-medium">
              {analysis.total} ouvrage(s) détecté(s){analysis.truncated ? " (fichier tronqué)" : ""}.
            </p>

            {analysis.headerFound ? (
              <div className="flex flex-wrap gap-1.5">
                {columns.map(([field, source]) => (
                  <span key={field} className="rounded-md border bg-muted/40 px-2 py-0.5 text-xs">
                    {FIELD_LABELS[field] ?? field} ← « {source} »
                  </span>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs">
                Aucun en-tête reconnu : colonnes lues dans l&apos;ordre de l&apos;export Soline (Référence,
                Désignation, Description, Catégorie, Unité, Prix HT, TVA…). Vérifie l&apos;aperçu.
              </p>
            )}

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[560px] text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                    <th className="px-3 py-2">Désignation</th>
                    <th className="px-3 py-2">Catégorie</th>
                    <th className="px-3 py-2">Unité</th>
                    <th className="px-3 py-2 text-right">Prix HT</th>
                    <th className="px-3 py-2 text-right">TVA</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.preview.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-medium">{row.title}</div>
                        {row.reference ? <div className="text-muted-foreground">{row.reference}</div> : null}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{row.category || "—"}</td>
                      <td className="px-3 py-2">{row.unit}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatEuros(row.unit_price_ht)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.default_vat_rate} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {analysis.errorCount > 0 ? (
              <details className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs">
                <summary className="cursor-pointer font-medium">{analysis.errorCount} alerte(s)</summary>
                <ul className="mt-2 list-disc space-y-0.5 pl-4">
                  {analysis.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Les doublons (même référence, ou même désignation et unité) sont ignorés. Les devis déjà émis ne
              sont pas modifiés.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={importing}>
            Annuler
          </Button>
          <Button type="button" onClick={() => void confirm()} disabled={!analysis || importing}>
            {importing ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Importer {analysis ? `${analysis.total} ouvrage(s)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
