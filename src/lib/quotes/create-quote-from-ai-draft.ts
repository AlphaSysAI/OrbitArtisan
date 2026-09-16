import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AiQuoteDraft, AiSupplierMaterialDraft } from "@/lib/ai/quote-draft-storage";

function parseEurToCents(raw: string): number {
  const cleaned = raw.trim().replace(",", ".").replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const asNumber = Number(cleaned);
  if (!Number.isFinite(asNumber)) return 0;
  return Math.round(asNumber * 100);
}

/** Taux de TVA BTP valides (normal + taux réduits rénovation). */
const VALID_VAT_RATES = [20, 10, 5.5] as const;
export type QuoteVatRate = (typeof VALID_VAT_RATES)[number];

/** Normalise un taux de TVA saisi (écran de validation) : replie sur 20 % si invalide. */
export function normalizeVatRate(raw: unknown): QuoteVatRate {
  const n = typeof raw === "string" ? Number(raw.replace(",", ".")) : Number(raw);
  return (VALID_VAT_RATES as readonly number[]).includes(n) ? (n as QuoteVatRate) : 20;
}

export type CreateQuoteFromDraftParams = {
  supabase: SupabaseClient;
  artisanId: string;
  draft: AiQuoteDraft;
  laborRatePerHourCents: number;
  status: "draft" | "sent";
  customerName?: string | null;
  customerEmail?: string | null;
  /**
   * Taux de TVA du devis (5.5 / 10 / 20), choisi par l'artisan à l'écran de
   * validation (Point 13 audit pré-pilote) — jamais deviné depuis le brouillon
   * IA, car l'éligibilité au taux réduit (rénovation > 2 ans, etc.) relève
   * d'un jugement métier que seul l'artisan peut poser. Défaut 20 % si absent.
   */
  vatRate?: number;
};

export type CreateQuoteFromDraftResult =
  | { ok: true; quoteId: string; grandTotalCents: number }
  | { ok: false; error: string };

/**
 * Durée de main d'œuvre à facturer pour un brouillon IA : celle estimée par l'IA si
 * disponible, sinon la somme des durées réelles des prestations correspondantes
 * (jamais un fallback arbitraire) — fonction partagée entre l'aperçu (liste
 * `/app/appels`) et la création réelle du devis, pour que les deux affichent
 * toujours le même chiffre (point "fidélité preview" audit pré-pilote, vague 4).
 */
export function resolveLaborDurationMinutes(
  draftLaborDurationMinutes: number,
  serviceIds: string[],
  serviceDurationsById: Map<string, number>,
): number {
  if (draftLaborDurationMinutes > 0) return draftLaborDurationMinutes;
  return serviceIds.reduce((acc, id) => acc + (serviceDurationsById.get(id) ?? 0), 0);
}

/**
 * Crée un devis en base à partir d'un brouillon IA (lead, vocal, assistant).
 */
export async function createQuoteFromAiDraft(
  params: CreateQuoteFromDraftParams,
): Promise<CreateQuoteFromDraftResult> {
  const customerName = (params.customerName ?? params.draft.customerName ?? "").trim() || null;
  const customerEmail = (params.customerEmail ?? params.draft.customerEmail ?? "").trim() || null;
  const vatRate = normalizeVatRate(params.vatRate ?? 20);
  const serviceIds = params.draft.matchedServiceIds ?? [];

  if (!serviceIds.length) {
    return { ok: false, error: "missing_services" };
  }
  if (!customerEmail) {
    return { ok: false, error: "missing_email" };
  }

  const { data: services } = await params.supabase
    .from("services")
    .select("id, title, duration, price")
    .eq("artisan_id", params.artisanId)
    .in("id", serviceIds);

  const serviceSet = new Set(serviceIds);
  const servicesFound = (services ?? []).filter((s) => serviceSet.has(s.id));

  if (servicesFound.length !== serviceIds.length) {
    return { ok: false, error: "invalid_services" };
  }

  const serviceDurationsById = new Map(servicesFound.map((s) => [s.id as string, (s.duration as number) ?? 0]));
  const laborDurationMinutes = resolveLaborDurationMinutes(
    params.draft.laborDurationMinutes,
    serviceIds,
    serviceDurationsById,
  );

  if (laborDurationMinutes <= 0) {
    return { ok: false, error: "invalid_duration" };
  }

  const laborRateCents = params.laborRatePerHourCents;
  const laborTotalCents = Math.round((laborRateCents * laborDurationMinutes) / 60);

  const materials = mapDraftMaterials(params.draft.supplierMaterials);
  if (materials.some((m) => !Number.isFinite(m.quantity) || m.quantity <= 0)) {
    return { ok: false, error: "invalid_materials" };
  }

  const materialsTotalCents = materials.reduce((acc, m) => {
    if (m.excludeFromInvoice) return acc;
    return acc + m.quantity * m.unitPriceCents;
  }, 0);

  const grandTotalCents = laborTotalCents + materialsTotalCents;

  const { data: createdQuote, error: quoteErr } = await params.supabase
    .from("quotes")
    .insert({
      artisan_id: params.artisanId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_user_id: null,
      conversation_id: null,
      status: params.status,
      notes: params.draft.notes?.trim() || null,
      labor_rate_per_hour: laborRateCents,
      labor_duration_minutes: laborDurationMinutes,
      labor_total: laborTotalCents,
      materials_total: materialsTotalCents,
      grand_total: grandTotalCents,
      reduced_vat_rate: vatRate,
      sent_at: params.status === "sent" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (quoteErr || !createdQuote?.id) {
    return { ok: false, error: "create_failed" };
  }

  const quoteServiceRows = servicesFound.map((s) => ({
    quote_id: createdQuote.id,
    service_id: s.id,
    service_title: s.title,
    duration_minutes: s.duration,
    unit_price: s.price ?? null,
  }));

  const { error: servicesLinesErr } = await params.supabase.from("quote_services").insert(quoteServiceRows);
  if (servicesLinesErr) {
    return { ok: false, error: "lines_failed" };
  }

  const quoteMaterialRows = materials
    .filter((m) => m.label)
    .map((m) => ({
      quote_id: createdQuote.id,
      label: m.label,
      quantity: m.quantity,
      unit_price: m.unitPriceCents,
      line_total: m.quantity * m.unitPriceCents,
      supplier_product_id: m.supplierProductId,
      supplier_url: m.supplierUrl,
      supplier_sku: m.supplierSku,
      is_supplier_catalog: m.isSupplierCatalog,
      exclude_from_invoice: m.excludeFromInvoice,
      vat_rate: vatRate,
    }));

  if (quoteMaterialRows.length) {
    const { error: materialsLinesErr } = await params.supabase.from("quote_materials").insert(quoteMaterialRows);
    if (materialsLinesErr) {
      return { ok: false, error: "materials_failed" };
    }
  }

  return {
    ok: true,
    quoteId: createdQuote.id as string,
    grandTotalCents,
  };
}

function mapDraftMaterials(rows: AiSupplierMaterialDraft[]) {
  return rows.map((m) => ({
    label: m.label.trim(),
    quantity: m.quantity,
    unitPriceCents: m.excludeFromInvoice ? 0 : parseEurToCents(m.unitPriceEur),
    supplierProductId: m.supplierProductId,
    supplierUrl: m.supplierUrl,
    supplierSku: m.supplierSku,
    isSupplierCatalog: Boolean(m.supplierProductId),
    excludeFromInvoice: m.excludeFromInvoice,
  }));
}

export type DraftMaterialLine = {
  label: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  excludeFromInvoice: boolean;
};

export type DraftTotals = {
  laborDurationMinutes: number;
  laborTotalCents: number;
  materialsTotalCents: number;
  grandTotalCents: number;
  materialLines: DraftMaterialLine[];
};

/**
 * Aperçu détaillé (main d'œuvre + lignes matériaux) d'un brouillon IA, à partir des
 * durées réelles des prestations (`serviceDurationsById` : id prestation → durée en
 * minutes, à charger une fois pour tout l'artisan côté appelant).
 *
 * Utilisée à la fois pour l'aperçu (liste `/app/appels`, avant clic) et pour la
 * création réelle du devis (`createQuoteFromAiDraft`) : même fonction, mêmes
 * chiffres partout — corrige l'écart constaté où l'aperçu retombait sur un
 * fallback fixe de 60 min quand `createQuoteFromAiDraft` utilisait la vraie somme
 * des durées de prestations.
 */
export function computeDraftTotals(
  draft: AiQuoteDraft,
  laborRatePerHourCents: number | null,
  serviceDurationsById: Map<string, number>,
): DraftTotals | null {
  if (!laborRatePerHourCents || laborRatePerHourCents < 0) return null;
  const serviceIds = draft.matchedServiceIds ?? [];
  if (!serviceIds.length) return null;

  const laborDurationMinutes = resolveLaborDurationMinutes(
    draft.laborDurationMinutes,
    serviceIds,
    serviceDurationsById,
  );
  if (laborDurationMinutes <= 0) return null;

  const laborTotalCents = Math.round((laborRatePerHourCents * laborDurationMinutes) / 60);

  const materialLines: DraftMaterialLine[] = mapDraftMaterials(draft.supplierMaterials ?? []).map((m) => ({
    label: m.label,
    quantity: m.quantity,
    unitPriceCents: m.unitPriceCents,
    lineTotalCents: m.excludeFromInvoice ? 0 : m.quantity * m.unitPriceCents,
    excludeFromInvoice: m.excludeFromInvoice,
  }));
  const materialsTotalCents = materialLines.reduce((acc, l) => acc + l.lineTotalCents, 0);

  return {
    laborDurationMinutes,
    laborTotalCents,
    materialsTotalCents,
    grandTotalCents: laborTotalCents + materialsTotalCents,
    materialLines,
  };
}

/** Estimation du total TTC indicatif depuis un brouillon (affichage liste appels). */
export function estimateDraftTotalCents(
  draft: AiQuoteDraft,
  laborRatePerHourCents: number | null,
  serviceDurationsById: Map<string, number>,
): number | null {
  return computeDraftTotals(draft, laborRatePerHourCents, serviceDurationsById)?.grandTotalCents ?? null;
}
