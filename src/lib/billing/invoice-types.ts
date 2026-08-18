export const INVOICE_TYPES = ["standard", "deposit", "progress", "final", "credit_note"] as const;

export type InvoiceType = (typeof INVOICE_TYPES)[number];

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  standard: "Facture",
  deposit: "Facture d'acompte",
  progress: "Facture de situation",
  final: "Facture de solde",
  credit_note: "Avoir",
};

export function invoiceTypeLabel(type: string | null | undefined): string {
  if (type && type in INVOICE_TYPE_LABELS) return INVOICE_TYPE_LABELS[type as InvoiceType];
  return INVOICE_TYPE_LABELS.standard;
}

export function invoiceNumberPrefix(type: InvoiceType): string {
  switch (type) {
    case "deposit":
      return "ACO";
    case "progress":
      return "SIT";
    case "final":
      return "SOL";
    case "credit_note":
      return "AVO";
    default:
      return "INV";
  }
}

/** Montant facturable restant sur un devis (centimes). */
export function computeRemainingBillableCents(
  quoteGrandTotalCents: number,
  invoicedCents: number,
): number {
  return Math.max(0, quoteGrandTotalCents - invoicedCents);
}

/** Montant cible pour un acompte (% du devis). */
export function computeDepositAmountCents(quoteGrandTotalCents: number, percent: number): number {
  const p = Math.min(Math.max(percent, 0), 100);
  return Math.round((quoteGrandTotalCents * p) / 100);
}

/** Montant pour une situation (% cumulé du devis moins déjà facturé). */
export function computeProgressInvoiceAmountCents(
  quoteGrandTotalCents: number,
  cumulativePercent: number,
  alreadyInvoicedCents: number,
): number {
  const target = computeDepositAmountCents(quoteGrandTotalCents, cumulativePercent);
  return Math.max(0, target - alreadyInvoicedCents);
}
