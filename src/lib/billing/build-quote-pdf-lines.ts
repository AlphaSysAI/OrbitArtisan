import type { QuotePdfTableLine, QuoteVatBreakdownRow } from "@/lib/billing/quote-pdf-types";

export function normalizeVatRate(rate: number | null | undefined): number {
  if (rate === 5.5 || rate === 10 || rate === 20) return rate;
  return 20;
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
  const totalDuration = params.laborDurationMinutes > 0 ? params.laborDurationMinutes : 0;

  if (params.services.length > 0 && totalDuration > 0 && params.laborTotalCents > 0) {
    for (const service of params.services) {
      const duration = service.duration_minutes ?? 0;
      const share =
        duration > 0 ? Math.round((params.laborTotalCents * duration) / totalDuration) : 0;
      if (share <= 0) continue;
      const hours = duration / 60;
      lines.push({
        designation: service.service_title,
        detail: "Main d'oeuvre",
        quantity: Math.round(hours * 100) / 100,
        quantityLabel: "h",
        unitPriceCents: params.laborRatePerHourCents,
        vatRate: laborVat,
        lineTotalCents: share,
      });
    }
  } else if (params.laborTotalCents > 0) {
    const hours = totalDuration > 0 ? totalDuration / 60 : 1;
    lines.push({
      designation: "Main d'oeuvre",
      quantity: Math.round(hours * 100) / 100,
      quantityLabel: "h",
      unitPriceCents: params.laborRatePerHourCents,
      vatRate: laborVat,
      lineTotalCents: params.laborTotalCents,
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
      quantityLabel: "u",
      unitPriceCents: material.unit_price,
      vatRate: normalizeVatRate(material.vat_rate),
      lineTotalCents: lineTotal,
    });
  }

  return lines;
}
