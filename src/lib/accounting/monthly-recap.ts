import { escapeCsv } from "@/lib/accounting/invoices-csv";
import { computeInvoicePdfTotals } from "@/lib/billing/facturx/render-invoice-pdf";
import { INVOICE_TYPE_LABELS, type InvoiceType } from "@/lib/billing/invoice-types";
import { escapeHtml } from "@/lib/email/html";

/**
 * Récapitulatif mensuel pour le comptable + résumé chiffré pour l'artisan.
 * La TVA est ventilée EXACTEMENT comme dans le XML Factur-X de chaque facture
 * (arrondi par ligne, somme par taux) : le comptable retrouve les mêmes montants.
 * Les avoirs viennent en négatif.
 */

export type RecapInvoice = {
  id: string;
  invoiceNumber: string | null;
  invoiceType: string | null;
  status: string | null;
  dueDate: string | null;
  paymentReceivedAt: string | null;
  lines: { lineTotalCents: number; vatRate: number; vatCategoryCode?: string | null }[];
};

export type MonthlyRecap = {
  invoiceCount: number;
  byType: { type: InvoiceType; label: string; count: number }[];
  totalHtCents: number;
  totalVatCents: number;
  totalTtcCents: number;
  vatByRate: { rate: number; baseCents: number; vatCents: number }[];
  paidCount: number;
  unpaidCount: number;
  overdueCount: number;
  remindersSent: number;
  piecesCount: number;
};

export function buildMonthlyRecap(input: { invoices: RecapInvoice[]; remindersSent: number; piecesCount: number; today: string }): MonthlyRecap {
  const byType = new Map<InvoiceType, number>();
  const vat = new Map<number, { baseCents: number; vatCents: number }>();
  let ht = 0;
  let tva = 0;
  let paid = 0;
  let overdue = 0;

  for (const inv of input.invoices) {
    const type = (inv.invoiceType && inv.invoiceType in INVOICE_TYPE_LABELS ? inv.invoiceType : "standard") as InvoiceType;
    byType.set(type, (byType.get(type) ?? 0) + 1);
    const sign = type === "credit_note" ? -1 : 1;
    const t = computeInvoicePdfTotals(
      inv.lines.map((l, i) => ({
        lineNumber: i + 1,
        label: "",
        quantity: 1,
        lineTotalCents: l.lineTotalCents,
        vatRate: l.vatRate,
        vatCategoryCode: l.vatCategoryCode ?? "S",
      })),
    );
    ht += sign * t.totalHtCents;
    tva += sign * t.totalVatCents;
    for (const g of t.vatGroups) {
      const row = vat.get(g.rate) ?? { baseCents: 0, vatCents: 0 };
      row.baseCents += sign * g.baseCents;
      row.vatCents += sign * g.taxCents;
      vat.set(g.rate, row);
    }
    if (type === "credit_note") continue;
    if (inv.status === "paid" || inv.paymentReceivedAt) paid++;
    else if (inv.dueDate && inv.dueDate < input.today) overdue++;
  }

  const billable = input.invoices.filter((i) => i.invoiceType !== "credit_note").length;
  return {
    invoiceCount: input.invoices.length,
    byType: [...byType.entries()].map(([type, count]) => ({ type, label: INVOICE_TYPE_LABELS[type], count })),
    totalHtCents: ht,
    totalVatCents: tva,
    totalTtcCents: ht + tva,
    vatByRate: [...vat.entries()].sort((a, b) => b[0] - a[0]).map(([rate, v]) => ({ rate, ...v })),
    paidCount: paid,
    unpaidCount: billable - paid,
    overdueCount: overdue,
    remindersSent: input.remindersSent,
    piecesCount: input.piecesCount,
  };
}

const eur = (c: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(c / 100);
const rate = (r: number) => `${String(r).replace(".", ",")} %`;
const plural = (n: number, s: string, p = `${s}s`) => `${n} ${n > 1 ? p : s}`;

/** Bloc HTML de synthèse en tête de l'e-mail au comptable. */
export function recapHtml(recap: MonthlyRecap): string {
  const cell = "padding:6px 10px;border-bottom:1px solid #e2e8f0";
  const rows = recap.vatByRate
    .map((v) => `<tr><td style="${cell}">TVA ${rate(v.rate)}</td><td style="${cell};text-align:right">${eur(v.baseCents)}</td><td style="${cell};text-align:right">${eur(v.vatCents)}</td></tr>`)
    .join("");
  const types = recap.byType.map((t) => `${escapeHtml(t.label)} : ${t.count}`).join(" · ");
  return `
    <table style="border-collapse:collapse;font-size:14px;margin:12px 0;min-width:320px">
      <thead><tr><th style="${cell};text-align:left">Ventilation</th><th style="${cell};text-align:right">Base HT</th><th style="${cell};text-align:right">TVA</th></tr></thead>
      <tbody>${rows}
        <tr><td style="${cell};font-weight:600">Total</td><td style="${cell};text-align:right;font-weight:600">${eur(recap.totalHtCents)}</td><td style="${cell};text-align:right;font-weight:600">${eur(recap.totalVatCents)}</td></tr>
        <tr><td style="${cell};font-weight:600">Total TTC</td><td colspan="2" style="${cell};text-align:right;font-weight:600">${eur(recap.totalTtcCents)}</td></tr>
      </tbody>
    </table>
    <p style="font-size:14px">${escapeHtml(types)}<br/>
    Encaissées : ${recap.paidCount} · En attente : ${recap.unpaidCount}${recap.overdueCount ? ` (dont ${recap.overdueCount} échue${recap.overdueCount > 1 ? "s" : ""})` : ""}<br/>
    Relances clients envoyées ce mois : ${recap.remindersSent}</p>`;
}

/** Synthèse CSV (jointe) : même ventilation, importable dans un tableur. */
export function recapCsv(recap: MonthlyRecap, periodLabel: string): string {
  const rows: (string | number)[][] = [
    ["Periode", periodLabel],
    ["Factures", recap.invoiceCount],
    ...recap.byType.map((t) => [t.label, t.count]),
    [],
    ["Taux TVA", "Base HT (centimes)", "TVA (centimes)"],
    ...recap.vatByRate.map((v) => [`${v.rate} %`, v.baseCents, v.vatCents]),
    ["Total", recap.totalHtCents, recap.totalVatCents],
    ["Total TTC (centimes)", recap.totalTtcCents],
    [],
    ["Encaissees", recap.paidCount],
    ["En attente", recap.unpaidCount],
    ["Echues", recap.overdueCount],
    ["Relances envoyees", recap.remindersSent],
    ["Pieces jointes transmises", recap.piecesCount],
  ];
  return rows.map((r) => r.map((v) => escapeCsv(v)).join(";")).join("\n") + "\n";
}

/**
 * Confirmation à l'artisan : la valeur rendue, en chiffres, en une phrase.
 * Ex. « Dossier de septembre transmis à ton comptable : 12 factures (8 450 € HT),
 * 3 justificatifs, 0 relance nécessaire. »
 */
export function artisanRecapMessage(recap: MonthlyRecap, monthLabel: string): string {
  const parts = [
    `${plural(recap.invoiceCount, "facture")} (${eur(recap.totalHtCents)} HT)`,
    recap.piecesCount ? plural(recap.piecesCount, "justificatif") : null,
    recap.remindersSent === 0 ? "0 relance nécessaire" : `${plural(recap.remindersSent, "relance")} envoyée${recap.remindersSent > 1 ? "s" : ""} pour toi`,
  ].filter(Boolean);
  const month = monthLabel.replace(/\s\d{4}$/, "");
  return `Dossier de ${month} transmis à ton comptable : ${parts.join(", ")}.${recap.overdueCount ? ` ${plural(recap.overdueCount, "facture")} en retard à surveiller.` : ""}`;
}
