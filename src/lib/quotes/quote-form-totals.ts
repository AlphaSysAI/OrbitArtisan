import { buildQuotePdfTableLines, computeVatBreakdown, sumQuoteTotals } from "@/lib/billing/build-quote-pdf-lines";

/**
 * Calculs du formulaire de devis (aperçu HT / TVA / TTC + payload serveur).
 *
 * Extraits tels quels de `quote-form.tsx` (refacto latence, point 8) pour
 * être testés indépendamment du rendu : l'aperçu utilise EXACTEMENT les
 * mêmes fonctions que le PDF envoyé au client (`build-quote-pdf-lines`).
 * Toute modification ici change les montants affichés et le JSON envoyé à
 * `createQuote` / `updateQuote` : couvrir par quote-form-totals.test.ts.
 */

export type LaborLine = {
  id: string;
  title: string;
  /** Saisie libre « 2,5 » (heures). */
  hours: string;
  /** Prestation du catalogue d'origine, si la ligne en vient. */
  serviceId: string | null;
};

export type MaterialRow = {
  id: string;
  label: string;
  description: string;
  unit: string;
  /** "" = suit la TVA du devis ; sinon taux spécifique à la ligne ("20" | "10" | "5.5"). */
  vatRate: string;
  quantity: number;
  unitPriceEur: string;
  supplierUrl: string;
  supplierSku: string;
  excludeFromInvoice: boolean;
};

export type SupplierMaterialRow = {
  id: string;
  label: string;
  quantity: number;
  unitPriceEur: string;
  supplierProductId: string | null;
  supplierUrl: string | null;
  supplierSku: string | null;
  excludeFromInvoice: boolean;
  similarity: number | null;
  requestedName: string;
  specifications: string | null;
};

export function parseEurToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(",", ".").replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const asNumber = Number(cleaned);
  if (!Number.isFinite(asNumber)) return null;
  return Math.round(asNumber * 100);
}

export function hoursToMinutes(raw: string): number {
  const cleaned = raw.trim().replace(",", ".").replace(/[^0-9.]/g, "");
  const hours = Number(cleaned);
  if (!cleaned || !Number.isFinite(hours) || hours <= 0) return 0;
  return Math.round(hours * 60);
}

/** Total HT d'une ligne (quantité × prix unitaire), null si incomplet. */
export function lineTotalCents(quantity: number, unitPriceEur: string): number | null {
  const unit = parseEurToCents(unitPriceEur);
  if (unit == null || !Number.isFinite(quantity) || quantity <= 0) return null;
  return Math.round(unit * quantity);
}

/** Total HT d'une ligne de main-d'œuvre, null si heures ou taux manquants. */
export function laborLineCents(laborRateCents: number | null, minutes: number): number | null {
  return laborRateCents != null && minutes > 0 ? Math.round((laborRateCents * minutes) / 60) : null;
}

export type LaborLinePayload = { title: string; minutes: number; service_id: string | null };

export function buildLaborLinesPayload(laborLines: LaborLine[]): LaborLinePayload[] {
  return laborLines
    .map((l) => ({ title: l.title.trim(), minutes: hoursToMinutes(l.hours), service_id: l.serviceId }))
    .filter((l) => l.title || l.minutes > 0);
}

export type QuoteMaterialPayload = {
  label: string;
  quantity: number;
  unit_price_eur: string;
  vat_rate: string;
  supplier_product_id?: string | null;
  supplier_url: string | null;
  supplier_sku: string | null;
  is_supplier_catalog: boolean;
  exclude_from_invoice: boolean;
};

export function buildMaterialsPayload(
  materials: MaterialRow[],
  supplierMaterials: SupplierMaterialRow[],
  reducedVatRate: string,
): QuoteMaterialPayload[] {
  const custom = materials
    .filter((m) => m.label.trim())
    .map((m) => ({
      label: m.label.trim(),
      quantity: m.quantity,
      unit_price_eur: m.unitPriceEur,
      vat_rate: m.vatRate || reducedVatRate,
      supplier_url: m.supplierUrl.trim() || null,
      supplier_sku: m.supplierSku.trim() || null,
      is_supplier_catalog: false,
      exclude_from_invoice: m.excludeFromInvoice,
    }));
  const supplier = supplierMaterials
    .filter((m) => m.label.trim())
    .map((m) => ({
      label: m.label.trim(),
      quantity: m.quantity,
      unit_price_eur: m.unitPriceEur,
      supplier_product_id: m.supplierProductId,
      supplier_url: m.supplierUrl,
      supplier_sku: m.supplierSku,
      is_supplier_catalog: true,
      exclude_from_invoice: m.excludeFromInvoice,
      // Matériaux catalogue : toujours au taux du devis (auparavant 20 % forcé).
      vat_rate: reducedVatRate,
    }));
  return [...custom, ...supplier];
}

export function computeMaterialsTotalCents(
  materials: MaterialRow[],
  supplierMaterials: SupplierMaterialRow[],
): number {
  const custom = materials.reduce((acc, m) => {
    if (m.excludeFromInvoice) return acc;
    const unit = parseEurToCents(m.unitPriceEur);
    if (!m.label.trim() || unit == null || !Number.isFinite(m.quantity) || m.quantity <= 0) return acc;
    return acc + unit * m.quantity;
  }, 0);
  const supplierBillable = supplierMaterials.reduce((acc, m) => {
    if (m.excludeFromInvoice) return acc;
    const unit = parseEurToCents(m.unitPriceEur);
    if (!m.label.trim() || unit == null || !Number.isFinite(m.quantity) || m.quantity <= 0) return acc;
    return acc + unit * m.quantity;
  }, 0);
  return custom + supplierBillable;
}

export function computeSupplierDirectTotalCents(
  materials: MaterialRow[],
  supplierMaterials: SupplierMaterialRow[],
): number {
  // Prix indicatif : une ligne en achat direct peut ne pas en avoir, elle compte alors pour 0.
  const sum = (rows: { label: string; quantity: number; unitPriceEur: string; excludeFromInvoice: boolean }[]) =>
    rows.reduce((acc, m) => {
      if (!m.excludeFromInvoice) return acc;
      const unit = parseEurToCents(m.unitPriceEur) ?? 0;
      if (!m.label.trim() || !Number.isFinite(m.quantity) || m.quantity <= 0) return acc;
      return acc + unit * m.quantity;
    }, 0);
  return sum(supplierMaterials) + sum(materials);
}

/** Aperçu calculé avec EXACTEMENT les mêmes fonctions que le PDF envoyé au client. */
export function computeDocumentTotals(params: {
  laborLinesPayload: LaborLinePayload[];
  materialsPayload: QuoteMaterialPayload[];
  laborTotalCents: number;
  effectiveLaborMinutes: number;
  laborRateCents: number | null;
  reducedVatRate: string;
}) {
  const lines = buildQuotePdfTableLines({
    services: params.laborLinesPayload.map((l) => ({
      service_title: l.title,
      duration_minutes: l.minutes,
      line_total: null,
      unit_price: null,
    })),
    materials: params.materialsPayload
      .filter((m) => !m.exclude_from_invoice)
      .map((m) => ({
        label: m.label,
        quantity: m.quantity,
        unit_price: parseEurToCents(m.unit_price_eur) ?? 0,
        line_total: null,
        vat_rate: Number(String(m.vat_rate).replace(",", ".")),
        exclude_from_invoice: false,
      })),
    laborTotalCents: params.laborTotalCents,
    laborDurationMinutes: params.effectiveLaborMinutes,
    laborRatePerHourCents: params.laborRateCents ?? 0,
    defaultVatRate: Number(params.reducedVatRate.replace(",", ".")),
  });
  const vatBreakdown = computeVatBreakdown(lines);
  return { vatBreakdown, ...sumQuoteTotals(vatBreakdown) };
}

/** Tous les dérivés du formulaire en un appel (utilisé par les tests de caractérisation). */
export function computeQuoteFormTotals(input: {
  laborLines: LaborLine[];
  materials: MaterialRow[];
  supplierMaterials: SupplierMaterialRow[];
  laborRateEur: string;
  reducedVatRate: string;
}) {
  const laborLinesPayload = buildLaborLinesPayload(input.laborLines);
  const effectiveLaborMinutes = laborLinesPayload.reduce((acc, l) => acc + l.minutes, 0);
  const laborRateCents = parseEurToCents(input.laborRateEur) ?? null;
  const laborTotalCents =
    laborRateCents == null || effectiveLaborMinutes <= 0
      ? 0
      : Math.round((laborRateCents * effectiveLaborMinutes) / 60);
  const materialsTotalCents = computeMaterialsTotalCents(input.materials, input.supplierMaterials);
  const supplierDirectTotalCents = computeSupplierDirectTotalCents(input.materials, input.supplierMaterials);
  const materialsPayload = buildMaterialsPayload(input.materials, input.supplierMaterials, input.reducedVatRate);
  const documentTotals = computeDocumentTotals({
    laborLinesPayload,
    materialsPayload,
    laborTotalCents,
    effectiveLaborMinutes,
    laborRateCents,
    reducedVatRate: input.reducedVatRate,
  });
  return {
    laborLinesPayload,
    effectiveLaborMinutes,
    laborRateCents,
    laborTotalCents,
    materialsTotalCents,
    supplierDirectTotalCents,
    materialsPayload,
    grandTotalCents: laborTotalCents + materialsTotalCents,
    documentTotals,
  };
}
