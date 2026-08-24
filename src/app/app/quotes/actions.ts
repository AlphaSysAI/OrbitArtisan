"use server";

import { revalidatePath } from "next/cache";

import { sendMessage } from "@/lib/messages/actions";
import { redirectIfCannotCreateDocuments } from "@/lib/billing/require-document-access";
import { sendQuoteByEmail } from "@/lib/quotes/send-quote-email";
import { buildQuoteNotificationMessage } from "@/lib/quotes/supplier-links";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSiteUrl } from "@/lib/site-url";

type ParsedMaterial = {
  label: string;
  quantity: number;
  unitPriceCents: number;
  supplierProductId?: string | null;
  supplierUrl?: string | null;
  supplierSku?: string | null;
  isSupplierCatalog?: boolean;
  excludeFromInvoice?: boolean;
  vat_rate?: number;
};

function parseEurToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(",", ".").replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const asNumber = Number(cleaned);
  if (!Number.isFinite(asNumber)) return null;
  return Math.round(asNumber * 100);
}

function safeParseJsonArray<T>(raw: string): T[] | null {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : null;
  } catch {
    return null;
  }
}

export async function createQuote(formData: FormData) {
  const customerName = String(formData.get("customer_name") ?? "").trim();
  const customerEmail = String(formData.get("customer_email") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const laborRateRaw = String(formData.get("labor_rate_per_hour_eur") ?? "").trim();
  const laborRateCentsFromForm = laborRateRaw ? parseEurToCents(laborRateRaw) : null;

  const serviceIdsRaw = String(formData.get("service_ids_json") ?? "[]");
  const serviceIds = safeParseJsonArray<string>(serviceIdsRaw);
  if (!serviceIds || serviceIds.length === 0) {
    return { ok: false as const, error: "missing_services" as const };
  }

  const materialsRaw = String(formData.get("materials_json") ?? "[]");
  const materialsParsed = safeParseJsonArray<any>(materialsRaw);

  const materials: ParsedMaterial[] = (materialsParsed ?? [])
    .map((m) => {
      const label = String(m?.label ?? "").trim();
      const quantity = Number(m?.quantity ?? 0);
      const excludeFromInvoice = Boolean(m?.exclude_from_invoice);
      const parsedPrice = parseEurToCents(String(m?.unit_price_eur ?? ""));
      const vatRateRaw = Number(String(m?.vat_rate ?? "20").replace(",", "."));
      const vat_rate = vatRateRaw === 5.5 || vatRateRaw === 10 || vatRateRaw === 20 ? vatRateRaw : 20;
      return {
        label,
        quantity,
        unitPriceCents: parsedPrice ?? (excludeFromInvoice ? 0 : NaN),
        supplierProductId: m?.supplier_product_id ? String(m.supplier_product_id) : null,
        supplierUrl: m?.supplier_url ? String(m.supplier_url).trim() || null : null,
        supplierSku: m?.supplier_sku ? String(m.supplier_sku).trim() || null : null,
        isSupplierCatalog: Boolean(m?.is_supplier_catalog),
        excludeFromInvoice,
        vat_rate,
      };
    })
    .filter((m) => m.label);

  if (materials.some((m) => !Number.isFinite(m.quantity) || m.quantity <= 0 || !Number.isFinite(m.unitPriceCents) || m.unitPriceCents < 0)) {
    return { ok: false as const, error: "invalid_materials" as const };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, error: "auth" as const };
  }

  await redirectIfCannotCreateDocuments(supabase, user.id);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, business_name, labor_rate_per_hour")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.id) {
    return { ok: false as const, error: "missing_profile" as const };
  }

  const laborRateCents =
    laborRateCentsFromForm ?? (profile.labor_rate_per_hour != null ? profile.labor_rate_per_hour : null);

  if (laborRateCents == null || !Number.isFinite(laborRateCents) || laborRateCents < 0) {
    return { ok: false as const, error: "missing_labor_rate" as const };
  }

  const { data: services } = await supabase
    .from("services")
    .select("id, title, duration, price")
    .eq("artisan_id", profile.id)
    .in("id", serviceIds);

  const serviceSet = new Set(serviceIds);
  const servicesFound = (services ?? []).filter((s) => serviceSet.has(s.id));

  if (servicesFound.length !== serviceIds.length) {
    return { ok: false as const, error: "invalid_services" as const };
  }

  const computedDurationMinutes = servicesFound.reduce((acc, s) => acc + (s.duration ?? 0), 0);
  if (computedDurationMinutes <= 0) {
    return { ok: false as const, error: "invalid_duration" as const };
  }

  const laborMinutesRaw = String(formData.get("labor_duration_minutes") ?? "").trim();
  const parsedOverride = Number.parseInt(laborMinutesRaw, 10);
  const useOverride =
    laborMinutesRaw !== "" && Number.isFinite(parsedOverride) && parsedOverride > 0 && parsedOverride <= 1_000_000;

  const laborDurationMinutes = useOverride ? parsedOverride : computedDurationMinutes;

  // Centimes = taux (cents/h) * minutes / 60, arrondi.
  const laborTotalCents = Math.round((laborRateCents * laborDurationMinutes) / 60);

  const materialsTotalCents = materials.reduce((acc, m) => {
    if (m.excludeFromInvoice) return acc;
    return acc + m.quantity * m.unitPriceCents;
  }, 0);

  const grandTotalCents = laborTotalCents + materialsTotalCents;

  const conversationIdRaw = String(formData.get("conversation_id") ?? "").trim();
  const customerUserIdRaw = String(formData.get("customer_user_id") ?? "").trim();

  let linkedConversationId: string | null = null;
  let linkedCustomerUserId: string | null = null;

  if (conversationIdRaw && customerUserIdRaw) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, artisan_id, customer_user_id")
      .eq("id", conversationIdRaw)
      .maybeSingle();
    if (!conv || conv.artisan_id !== profile.id || conv.customer_user_id !== customerUserIdRaw) {
      return { ok: false as const, error: "invalid_conversation" as const };
    }
    linkedConversationId = conv.id;
    linkedCustomerUserId = conv.customer_user_id;
  } else if (conversationIdRaw || customerUserIdRaw) {
    return { ok: false as const, error: "invalid_conversation" as const };
  }

  const saveMode = String(formData.get("save_mode") ?? "").trim();
  const forceDraft = saveMode === "draft";
  const forceSend = saveMode === "send";

  const reducedVatRaw = String(formData.get("reduced_vat_rate") ?? "").trim();
  const reduced_vat_rate =
    reducedVatRaw === "5.5" || reducedVatRaw === "10" || reducedVatRaw === "20" ? Number(reducedVatRaw) : null;
  const generate_vat_attestation = String(formData.get("generate_vat_attestation") ?? "") === "1";
  const work_site_address = String(formData.get("work_site_address") ?? "").trim() || null;
  const work_site_city = String(formData.get("work_site_city") ?? "").trim() || null;
  const work_site_postal_code = String(formData.get("work_site_postal_code") ?? "").trim() || null;

  const quoteStatus =
    forceDraft
      ? "draft"
      : forceSend
        ? "sent"
        : linkedConversationId && linkedCustomerUserId
          ? "sent"
          : "draft";

  const { data: createdQuote, error: quoteErr } = await supabase
    .from("quotes")
    .insert({
      artisan_id: profile.id,
      customer_name: customerName || null,
      customer_email: customerEmail || null,
      customer_user_id: linkedCustomerUserId,
      conversation_id: linkedConversationId,
      status: quoteStatus,
      notes: notes || null,
      labor_rate_per_hour: laborRateCents,
      labor_duration_minutes: laborDurationMinutes,
      labor_total: laborTotalCents,
      materials_total: materialsTotalCents,
      grand_total: grandTotalCents,
      reduced_vat_rate,
      generate_vat_attestation: generate_vat_attestation && (reduced_vat_rate === 5.5 || reduced_vat_rate === 10),
      work_site_address,
      work_site_city,
      work_site_postal_code,
      sent_at: quoteStatus === "sent" ? new Date().toISOString() : null,
    })
    .select("id, public_token")
    .single();

  if (quoteErr || !createdQuote?.id) {
    return { ok: false as const, error: "create_failed" as const };
  }

  // Lignes prestations
  const quoteServiceRows = servicesFound.map((s) => ({
    quote_id: createdQuote.id,
    service_id: s.id,
    service_title: s.title,
    duration_minutes: s.duration,
    unit_price: s.price ?? null,
  }));

  const { error: servicesLinesErr } = await supabase.from("quote_services").insert(quoteServiceRows);
  if (servicesLinesErr) {
    return { ok: false as const, error: "lines_failed" as const };
  }

  // Lignes matériaux
  const quoteMaterialRows = materials
    .filter((m) => m.label)
    .map((m) => ({
      quote_id: createdQuote.id,
      label: m.label,
      quantity: m.quantity,
      unit_price: m.unitPriceCents,
      line_total: m.quantity * m.unitPriceCents,
      supplier_product_id: m.supplierProductId ?? null,
      supplier_url: m.supplierUrl ?? null,
      supplier_sku: m.supplierSku ?? null,
      is_supplier_catalog: m.isSupplierCatalog ?? false,
      exclude_from_invoice: m.excludeFromInvoice ?? false,
      vat_rate: m.vat_rate ?? 20,
    }));

  if (quoteMaterialRows.length) {
    const { error: materialsLinesErr } = await supabase
      .from("quote_materials")
      .insert(quoteMaterialRows);
    if (materialsLinesErr) return { ok: false as const, error: "materials_failed" as const };
  }

  let notifyFailed = false;
  let emailSent = false;
  const shouldNotifyConversation = quoteStatus === "sent" && !!linkedConversationId;
  if (shouldNotifyConversation) {
    const siteUrl = getPublicSiteUrl();
    const totalFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
      grandTotalCents / 100,
    );
    const body = buildQuoteNotificationMessage({
      totalFormatted: totalFmt,
      quoteUrl: `${siteUrl}/mes-devis/${createdQuote.id}`,
      directPurchaseItems: materials
        .filter((m) => m.excludeFromInvoice)
        .map((m) => ({
          label: m.label,
          quantity: m.quantity,
          supplierUrl: m.supplierUrl ?? null,
          supplierSku: m.supplierSku ?? null,
        })),
    });
    const sent = await sendMessage(linkedConversationId!, body);
    if (!sent.ok) notifyFailed = true;
  }

  if (quoteStatus === "sent" && customerEmail && !linkedConversationId) {
    const emailResult = await sendQuoteByEmail({
      to: customerEmail,
      customerName,
      businessName: profile.business_name,
      quotePublicToken: String(createdQuote.public_token ?? ""),
      grandTotalCents,
    });
    emailSent = emailResult.ok;
    if (!emailResult.ok) notifyFailed = true;
  }

  const voiceIntakeId = String(formData.get("voice_intake_id") ?? "").trim();
  if (voiceIntakeId && quoteStatus === "sent") {
    await supabase
      .from("voice_call_intakes")
      .update({ status: "validated", quote_id: createdQuote.id })
      .eq("id", voiceIntakeId)
      .eq("artisan_id", profile.id)
      .eq("status", "pending_review");
    revalidatePath("/app/appels");
  }

  revalidatePath("/app/quotes");
  revalidatePath("/mes-devis");
  return {
    ok: true as const,
    quoteId: createdQuote.id,
    notifyFailed,
    emailSent,
    status: quoteStatus,
  };
}

