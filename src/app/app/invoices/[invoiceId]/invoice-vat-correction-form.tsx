"use client";

import { Button } from "@/components/ui/button";

import { correctInvoiceVatRate } from "./invoice-detail-actions";

const VAT_OPTIONS = [
  { value: "20", label: "20 % (taux normal)" },
  { value: "10", label: "10 % (rénovation)" },
  { value: "5.5", label: "5.5 % (rénovation énergétique)" },
];

/**
 * Point 3 audit pré-pilote : correction manuelle du taux de TVA.
 * Applique un taux unique à toutes les lignes de la facture brouillon —
 * volontairement pas de correction ligne par ligne, pour rester simple et
 * rapide à utiliser sur chantier. Bloqué serveur-side hors brouillon.
 */
export function InvoiceVatCorrectionForm({ invoiceId, defaultRate }: { invoiceId: string; defaultRate: number }) {
  return (
    <form action={correctInvoiceVatRate} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <div className="space-y-1">
        <label htmlFor="vat_rate" className="text-xs font-medium text-muted-foreground">
          Corriger le taux de TVA (toutes les lignes)
        </label>
        <select
          id="vat_rate"
          name="vat_rate"
          defaultValue={String(defaultRate)}
          className="flex h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm"
        >
          {VAT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="outline" size="sm">
        Appliquer
      </Button>
    </form>
  );
}
