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

export type CreateQuoteFromDraftParams = {
  supabase: SupabaseClient;
  artisanId: string;
  draft: AiQuoteDraft;
  laborRatePerHourCents: number;
  status: "draft" | "sent";
  customerName?: string | null;
  customerEmail?: string | null;
};

export type CreateQuoteFromDraftResult =
  | { ok: true; quoteId: string; publicToken: string; grandTotalCents: number }
  | { ok: false; error: string };

/**
 * Crée un devis en base à partir d'un brouillon IA (lead, vocal, assistant).
 */
export async function createQuoteFromAiDraft(
  params: CreateQuoteFromDraftParams,
): Promise<CreateQuoteFromDraftResult> {
  const customerName = (params.customerName ?? params.draft.customerName ?? "").trim() || null;
  const customerEmail = (params.customerEmail ?? params.draft.customerEmail ?? "").trim() || null;
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

  const computedDurationMinutes = servicesFound.reduce((acc, s) => acc + (s.duration ?? 0), 0);
  const laborDurationMinutes =
    params.draft.laborDurationMinutes > 0 ? params.draft.laborDurationMinutes : computedDurationMinutes;

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
      sent_at: params.status === "sent" ? new Date().toISOString() : null,
    })
    .select("id, public_token")
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
      vat_rate: 20,
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
    publicToken: String(createdQuote.public_token ?? ""),
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

/** Estimation du total TTC indicatif depuis un brouillon (affichage liste appels). */
export function estimateDraftTotalCents(
  draft: AiQuoteDraft,
  laborRatePerHourCents: number | null,
): number | null {
  if (!laborRatePerHourCents || laborRatePerHourCents < 0) return null;
  if (!draft.matchedServiceIds?.length) return null;

  const laborMinutes = draft.laborDurationMinutes > 0 ? draft.laborDurationMinutes : 60;
  const laborTotal = Math.round((laborRatePerHourCents * laborMinutes) / 60);

  const materialsTotal = (draft.supplierMaterials ?? []).reduce((acc, m) => {
    if (m.excludeFromInvoice) return acc;
    const cents = parseEurToCents(m.unitPriceEur);
    return acc + m.quantity * cents;
  }, 0);

  return laborTotal + materialsTotal;
}
