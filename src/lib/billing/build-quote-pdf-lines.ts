import type { QuotePdfTableLine, QuoteVatBreakdownRow } from "@/lib/billing/quote-pdf-types";
import { materialUnitLabel } from "@/lib/quotes/material-unit";

/**
 * 0 % = franchise en base (art. 293 B) : la base n'accepte 0 que pour une entreprise
 * en franchise (migration 51), on le respecte donc tel quel à l'affichage.
 */
export function normalizeVatRate(rate: number | null | undefined): number {
  const n = rate === null || rate === undefined ? NaN : Number(rate);
  if (n === 0 || n === 5.5 || n === 10 || n === 20) return n;
  return 20;
}

/** Document en franchise de TVA : toutes ses lignes sont à 0 %. */
export function isVatFranchiseDocument(lines: { vatRate: number }[]): boolean {
  return lines.length > 0 && lines.every((l) => l.vatRate === 0);
}

export function computeVatBreakdown(lines: QuotePdfTableLine[]): QuoteVatBreakdownRow[] {
  const map = new Map<number, number>();
  for (const line of lines) {
    map.set(line.vatRate, (map.get(line.vatRate) ?? 0) + line.lineTotalCents);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rate, baseHtCents]) => ({
      rate,
      baseHtCents,
      vatCents: Math.round((baseHtCents * rate) / 100),
    }));
}

export function sumQuoteTotals(vatBreakdown: QuoteVatBreakdownRow[]) {
  const totalHtCents = vatBreakdown.reduce((s, r) => s + r.baseHtCents, 0);
  const totalVatCents = vatBreakdown.reduce((s, r) => s + r.vatCents, 0);
  return {
    totalHtCents,
    totalVatCents,
    totalTtcCents: totalHtCents + totalVatCents,
  };
}

type ServiceRow = {
  service_title: string;
  duration_minutes: number | null;
  line_total: number | null;
  unit_price: number | null;
};

type MaterialRow = {
  label: string;
  quantity: number;
  unit_price: number;
  line_total: number | null;
  vat_rate: number | null;
  exclude_from_invoice?: boolean | null;
  /** Unité marchande persistée (null : ancienne ligne → « u »). */
  unit?: string | null;
};

export function buildQuotePdfTableLines(params: {
  services: ServiceRow[];
  materials: MaterialRow[];
  laborTotalCents: number;
  laborDurationMinutes: number;
  laborRatePerHourCents: number;
  defaultVatRate: number;
}): QuotePdfTableLine[] {
  const lines: QuotePdfTableLine[] = [];
  const laborVat = normalizeVatRate(params.defaultVatRate);
  const laborTotal = Math.max(0, params.laborTotalCents);
  // Durée facturée (peut différer de la somme des prestations : estimation IA,
  // ajustement manuel). C'est elle qui fait foi pour le nombre d'heures.
  const billedMinutes = params.laborDurationMinutes > 0 ? params.laborDurationMinutes : 0;
  const serviceMinutes = params.services.map((s) => Math.max(0, s.duration_minutes ?? 0));
  const serviceMinutesSum = serviceMinutes.reduce((a, b) => a + b, 0);

  if (laborTotal > 0 && params.services.length > 0 && serviceMinutesSum > 0) {
    // Répartition au prorata des durées des prestations, sur la durée FACTURÉE,
    // avec reste au plus fort : la somme des lignes = labor_total au centime près.
    const exact = serviceMinutes.map((m) => (laborTotal * m) / serviceMinutesSum);
    const shares = exact.map(Math.floor);
    let remainder = laborTotal - shares.reduce((a, b) => a + b, 0);
    exact
      .map((value, index) => ({ index, frac: value - Math.floor(value) }))
      .sort((a, b) => b.frac - a.frac)
      .forEach(({ index }) => {
        if (remainder > 0) {
          shares[index] += 1;
          remainder -= 1;
        }
      });

    params.services.forEach((service, index) => {
      const share = shares[index] ?? 0;
      if (share <= 0) return;
      const minutes = billedMinutes > 0 ? (billedMinutes * serviceMinutes[index]) / serviceMinutesSum : serviceMinutes[index];
      lines.push({
        designation: service.service_title,
        detail: "Main d'oeuvre",
        quantity: Math.round((minutes / 60) * 100) / 100,
        quantityLabel: "h",
        unitPriceCents: params.laborRatePerHourCents,
        vatRate: laborVat,
        lineTotalCents: share,
      });
    });
  } else if (laborTotal > 0) {
    // Prestations sans durée renseignée : une seule ligne, jamais de main-d'œuvre perdue.
    const titles = params.services.map((s) => s.service_title).filter(Boolean);
    const hours =
      billedMinutes > 0
        ? billedMinutes / 60
        : params.laborRatePerHourCents > 0
          ? laborTotal / params.laborRatePerHourCents
          : 1;
    lines.push({
      designation: titles.length ? titles.join(", ") : "Main d'oeuvre",
      detail: titles.length ? "Main d'oeuvre" : undefined,
      quantity: Math.round(hours * 100) / 100,
      quantityLabel: "h",
      unitPriceCents: params.laborRatePerHourCents,
      vatRate: laborVat,
      lineTotalCents: laborTotal,
    });
  }

  for (const material of params.materials) {
    if (material.exclude_from_invoice) continue;
    const lineTotal = material.line_total ?? Math.round(material.quantity * material.unit_price);
    if (lineTotal <= 0) continue;
    lines.push({
      designation: material.label,
      detail: "Fourniture",
      quantity: material.quantity,
      quantityLabel: materialUnitLabel(material.unit),
      unitPriceCents: material.unit_price,
      vatRate: normalizeVatRate(material.vat_rate),
      lineTotalCents: lineTotal,
    });
  }

  return lines;
}
