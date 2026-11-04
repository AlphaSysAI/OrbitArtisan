export type InvoiceAmountLine = {
  lineTotalCents: number;
  vatRate: number;
  vatCategoryCode: string;
  vatExemptionReason?: string | null;
};

export function invoiceLineTaxCents(htCents: number, rate: number) {
  return Math.round((htCents * rate) / 100);
}

type InvoicePdfVatGroup = {
  rate: number;
  categoryCode: string;
  baseCents: number;
  taxCents: number;
  exemptionReason: string | null;
};

/**
 * Ventilation TVA IDENTIQUE au XML CII (build-cii-invoice.ts) et à l'e-reporting :
 * TVA arrondie ligne par ligne puis sommée par (catégorie, taux). Le PDF et le XML
 * d'une même facture Factur-X ne doivent jamais diverger d'un centime.
 */
export function computeInvoiceTotals(lines: readonly InvoiceAmountLine[]) {
  const groups = new Map<string, InvoicePdfVatGroup>();
  for (const line of lines) {
    const key = `${line.vatCategoryCode}:${line.vatRate}`;
    const taxCents = invoiceLineTaxCents(line.lineTotalCents, line.vatRate);
    const g = groups.get(key);
    if (g) {
      g.baseCents += line.lineTotalCents;
      g.taxCents += taxCents;
    } else {
      groups.set(key, {
        rate: line.vatRate,
        categoryCode: line.vatCategoryCode,
        baseCents: line.lineTotalCents,
        taxCents,
        exemptionReason: line.vatExemptionReason ?? null,
      });
    }
  }
  const vatGroups = [...groups.values()].sort((a, b) => b.rate - a.rate);
  const totalHtCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const totalVatCents = vatGroups.reduce((s, g) => s + g.taxCents, 0);
  return { vatGroups, totalHtCents, totalVatCents, totalTtcCents: totalHtCents + totalVatCents };
}

/** Répartit un montant en centimes, sans perte d'arrondi. */
export function allocateInvoiceCents(amount: number, weights: readonly number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return weights.map(() => 0);
  const parts = weights.map((weight, index) => {
    const exact = (weight / total) * amount;
    const cents = Math.floor(exact);
    return { index, cents, remainder: exact - cents };
  });
  const left = amount - parts.reduce((sum, part) => sum + part.cents, 0);
  const ranked = [...parts].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const part of ranked.slice(0, left)) part.cents++;
  return parts.map((part) => part.cents);
}
