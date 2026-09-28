/** Récapitulatif CSV des factures émises (export manuel et envoi comptable). */

export type InvoiceCsvRow = {
  invoice_number: string | null;
  invoice_type: string | null;
  status: string | null;
  finalized_at: string | null;
  due_date: string | null;
  customer_name: string | null;
  customer_email: string | null;
  grand_total: number | null;
  labor_total: number | null;
  materials_total: number | null;
  payment_received_at?: string | null;
};

function escapeCsv(value: string | number | null | undefined): string {
  const s = String(value ?? "");
  if (/[;,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * CSV séparé par des virgules, montants en centimes (format historique de l'export
 * manuel, conservé pour ne pas casser les imports déjà paramétrés chez les comptables).
 */
export function buildInvoicesCsv(invoices: InvoiceCsvRow[]): string {
  const header = [
    "Numero",
    "Type",
    "Statut",
    "Date emission",
    "Date echeance",
    "Client",
    "Email client",
    "Total TTC centimes",
    "MO centimes",
    "Materiaux centimes",
    "Date paiement",
  ].join(",");

  const rows = invoices.map((inv) =>
    [
      escapeCsv(inv.invoice_number),
      escapeCsv(inv.invoice_type),
      escapeCsv(inv.status),
      escapeCsv(inv.finalized_at?.slice(0, 10)),
      escapeCsv(inv.due_date),
      escapeCsv(inv.customer_name),
      escapeCsv(inv.customer_email),
      inv.grand_total ?? 0,
      inv.labor_total ?? 0,
      inv.materials_total ?? 0,
      escapeCsv(inv.payment_received_at?.slice(0, 10)),
    ].join(","),
  );

  // BOM UTF-8 : accents lisibles à l'ouverture dans Excel.
  return `﻿${[header, ...rows].join("\n")}`;
}
