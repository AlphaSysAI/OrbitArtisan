"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAuthenticatedUser, resolveArtisanProfile } from "@/lib/auth/require-artisan";
import { redirectIfCannotCreateDocuments } from "@/lib/billing/require-document-access";
import { notifyQuoteSentToCustomer } from "@/lib/notifications/notify-events";
import { sendQuoteByEmail } from "@/lib/quotes/send-quote-email";
import { validateQuoteLegalProfile, type QuoteLegalValidation } from "@/lib/billing/quote-pdf-legal";
import { sendQuotePdfInConversation } from "@/lib/quotes/send-quote-pdf";

const PROFILE_LEGAL_COLUMNS = [
  "business_name",
  "labor_rate_per_hour",
  "siren",
  "siret",
  "address_line1",
  "postal_code",
  "city",
  "vat_number",
  "trade_register_number",
  "decennale_insurer",
  "decennale_policy_number",
  "rc_pro_insurer",
  "rc_pro_number",
  "mediator_name",
  "mediator_url",
];

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

type MaterialJsonRow = {
  label?: unknown;
  quantity?: unknown;
  exclude_from_invoice?: unknown;
  unit_price_eur?: unknown;
  vat_rate?: unknown;
  supplier_product_id?: unknown;
  supplier_url?: unknown;
  supplier_sku?: unknown;
  is_supplier_catalog?: unknown;
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

type QuoteInputError =
  | {
      ok: false;
      error:
        | "missing_services"
        | "invalid_materials"
        | "missing_labor_rate"
        | "invalid_services"
        | "invalid_duration"
        | "invalid_conversation"
        | "missing_customer";
    }
  | { ok: false; error: "quote_pdf_profile_incomplete"; validation: QuoteLegalValidation };

type ResolvedQuoteInput = {
  customerName: string;
  customerEmail: string;
  notes: string;
  laborRateCents: number;
  laborDurationMinutes: number;
  laborTotalCents: number;
  materialsTotalCents: number;
  grandTotalCents: number;
  servicesFound: { id: string; title: string; duration: number; price: number | null }[];
  materials: ParsedMaterial[];
  linkedConversationId: string | null;
  linkedCustomerUserId: string | null;
  quoteStatus: "draft" | "sent";
  reducedVatRate: number | null;
  generateVatAttestation: boolean;
  workSiteAddress: string | null;
  workSiteCity: string | null;
  workSitePostalCode: string | null;
  retractionWaived: boolean;
  validUntil: string;
  voiceIntakeId: string;
};

/**
 * Parsing, résolution et validation partagés entre création (`createQuote`) et
 * édition d'un brouillon (`updateQuote`) — extrait pour que les deux chemins ne
 * puissent pas diverger sur le calcul du total, le contrôle légal à l'envoi, ou
 * la résolution de la conversation liée (Vague 5, Temps 2, point 4 de l'audit
 * devis : édition/suppression de devis absentes).
 */
async function resolveQuoteInput(
  formData: FormData,
  ctx: { supabase: SupabaseClient; profileId: string; profile: Record<string, unknown> },
): Promise<{ ok: true; data: ResolvedQuoteInput } | QuoteInputError> {
  const { supabase, profileId, profile } = ctx;

  const customerName = String(formData.get("customer_name") ?? "").trim();
  const customerEmail = String(formData.get("customer_email") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const laborRateRaw = String(formData.get("labor_rate_per_hour_eur") ?? "").trim();
  const laborRateCentsFromForm = laborRateRaw ? parseEurToCents(laborRateRaw) : null;

  const serviceIdsRaw = String(formData.get("service_ids_json") ?? "[]");
  const serviceIds = safeParseJsonArray<string>(serviceIdsRaw);
  if (!serviceIds || serviceIds.length === 0) {
    return { ok: false, error: "missing_services" };
  }

  const materialsRaw = String(formData.get("materials_json") ?? "[]");
  const materialsParsed = safeParseJsonArray<MaterialJsonRow>(materialsRaw);

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
    return { ok: false, error: "invalid_materials" };
  }

  const profileLaborRate = profile.labor_rate_per_hour as number | null;
  const laborRateCents = laborRateCentsFromForm ?? (profileLaborRate != null ? profileLaborRate : null);

  if (laborRateCents == null || !Number.isFinite(laborRateCents) || laborRateCents < 0) {
    return { ok: false, error: "missing_labor_rate" };
  }

  const { data: services } = await supabase
    .from("services")
    .select("id, title, duration, price")
    .eq("artisan_id", profileId)
    .in("id", serviceIds);

  const serviceSet = new Set(serviceIds);
  const servicesFound = (services ?? []).filter((s) => serviceSet.has(s.id));

  if (servicesFound.length !== serviceIds.length) {
    return { ok: false, error: "invalid_services" };
  }

  const computedDurationMinutes = servicesFound.reduce((acc, s) => acc + (s.duration ?? 0), 0);
  if (computedDurationMinutes <= 0) {
    return { ok: false, error: "invalid_duration" };
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

  if (conversationIdRaw) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, artisan_id, customer_user_id")
      .eq("id", conversationIdRaw)
      .maybeSingle();
    if (!conv || conv.artisan_id !== profileId) {
      return { ok: false, error: "invalid_conversation" };
    }
    // Lead Soline : customer_user_id reste null tant que le prospect n'a pas de compte.
    if (customerUserIdRaw && conv.customer_user_id !== customerUserIdRaw) {
      return { ok: false, error: "invalid_conversation" };
    }
    linkedConversationId = conv.id;
    linkedCustomerUserId = conv.customer_user_id;
  } else if (customerUserIdRaw) {
    return { ok: false, error: "invalid_conversation" };
  }

  const saveMode = String(formData.get("save_mode") ?? "").trim();
  const forceDraft = saveMode === "draft";
  const forceSend = saveMode === "send";

  const reducedVatRaw = String(formData.get("reduced_vat_rate") ?? "").trim();
  const reducedVatRate =
    reducedVatRaw === "5.5" || reducedVatRaw === "10" || reducedVatRaw === "20" ? Number(reducedVatRaw) : null;
  const generateVatAttestation = String(formData.get("generate_vat_attestation") ?? "") === "1";
  const workSiteAddress = String(formData.get("work_site_address") ?? "").trim() || null;
  const workSiteCity = String(formData.get("work_site_city") ?? "").trim() || null;
  const workSitePostalCode = String(formData.get("work_site_postal_code") ?? "").trim() || null;
  const retractionWaived = String(formData.get("retraction_waived") ?? "") === "1";
  const voiceIntakeId = String(formData.get("voice_intake_id") ?? "").trim();

  // Figé une seule fois (pas recalculé plus tard) pour matcher exactement la date
  // imprimée sur le PDF envoyé au client — c'est cette valeur que
  // client_accept_quote vérifie avant d'accepter la signature.
  const validUntilDate = new Date();
  validUntilDate.setMonth(validUntilDate.getMonth() + 3);
  const validUntil = validUntilDate.toISOString().slice(0, 10);

  const quoteStatus: "draft" | "sent" = forceDraft
    ? "draft"
    : forceSend || (linkedConversationId && linkedCustomerUserId)
      ? "sent"
      : "draft";

  if (quoteStatus === "sent") {
    if (!customerName?.trim() && !customerEmail?.trim()) {
      return { ok: false, error: "missing_customer" };
    }
    const legalCheck = validateQuoteLegalProfile({
      business_name: profile.business_name as string | null,
      siren: profile.siren as string | null,
      siret: profile.siret as string | null,
      vat_number: profile.vat_number as string | null,
      trade_register_number: profile.trade_register_number as string | null,
      decennale_insurer: profile.decennale_insurer as string | null,
      decennale_policy_number: profile.decennale_policy_number as string | null,
      rc_pro_insurer: profile.rc_pro_insurer as string | null,
      rc_pro_number: profile.rc_pro_number as string | null,
      mediator_name: profile.mediator_name as string | null,
      mediator_url: profile.mediator_url as string | null,
      addressLine1: profile.address_line1 as string | null,
      postalCode: profile.postal_code as string | null,
      city: profile.city as string | null,
    });
    if (!legalCheck.ok) {
      return { ok: false, error: "quote_pdf_profile_incomplete", validation: legalCheck };
    }
  }

  return {
    ok: true,
    data: {
      customerName,
      customerEmail,
      notes,
      laborRateCents,
      laborDurationMinutes,
      laborTotalCents,
      materialsTotalCents,
      grandTotalCents,
      servicesFound,
      materials,
      linkedConversationId,
      linkedCustomerUserId,
      quoteStatus,
      reducedVatRate,
      generateVatAttestation,
      workSiteAddress,
      workSiteCity,
      workSitePostalCode,
      retractionWaived,
      validUntil,
      voiceIntakeId,
    },
  };
}

/** (Ré)écrit les lignes prestations/matériaux d'un devis (insertion pure — l'appelant a déjà purgé les anciennes lignes en cas d'édition). */
async function writeQuoteLines(supabase: SupabaseClient, quoteId: string, d: ResolvedQuoteInput) {
  const quoteServiceRows = d.servicesFound.map((s) => ({
    quote_id: quoteId,
    service_id: s.id,
    service_title: s.title,
    duration_minutes: s.duration,
    unit_price: s.price ?? null,
  }));

  const { error: servicesLinesErr } = await supabase.from("quote_services").insert(quoteServiceRows);
  if (servicesLinesErr) {
    return { ok: false as const, error: "lines_failed" as const };
  }

  const quoteMaterialRows = d.materials
    .filter((m) => m.label)
    .map((m) => ({
      quote_id: quoteId,
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
    const { error: materialsLinesErr } = await supabase.from("quote_materials").insert(quoteMaterialRows);
    if (materialsLinesErr) return { ok: false as const, error: "materials_failed" as const };
  }

  return { ok: true as const };
}

/** Notifie/e-maile le client quand le devis passe (ou reste) au statut "sent". */
async function notifyQuoteIfSent(
  supabase: SupabaseClient,
  params: { quoteId: string; profileId: string; userId: string; profileBusinessName: string | null; d: ResolvedQuoteInput },
): Promise<
  | { ok: true; notifyFailed: boolean; emailSent: boolean }
  | { ok: false; error: "quote_pdf_profile_incomplete"; validation: QuoteLegalValidation }
> {
  const { quoteId, profileId, userId, profileBusinessName, d } = params;
  let notifyFailed = false;
  let emailSent = false;

  const shouldNotifyConversation = d.quoteStatus === "sent" && !!d.linkedConversationId;
  if (shouldNotifyConversation) {
    const sent = await sendQuotePdfInConversation(supabase, {
      conversationId: d.linkedConversationId!,
      senderUserId: userId,
      quoteId,
      artisanId: profileId,
      grandTotalCents: d.grandTotalCents,
      directPurchaseItems: d.materials
        .filter((m) => m.excludeFromInvoice)
        .map((m) => ({
          label: m.label,
          quantity: m.quantity,
          supplierUrl: m.supplierUrl ?? null,
          supplierSku: m.supplierSku ?? null,
        })),
    });
    if (!sent.ok) {
      if (sent.error === "quote_pdf_profile_incomplete") {
        return { ok: false, error: "quote_pdf_profile_incomplete", validation: sent.validation };
      }
      notifyFailed = true;
    }
  }

  if (d.quoteStatus === "sent" && d.customerEmail && !d.linkedConversationId) {
    const emailResult = await sendQuoteByEmail({
      supabase,
      quoteId,
      artisanId: profileId,
      to: d.customerEmail,
      customerName: d.customerName,
      businessName: profileBusinessName,
      grandTotalCents: d.grandTotalCents,
    });
    emailSent = emailResult.ok;
    if (!emailResult.ok) notifyFailed = true;
  }

  if (d.quoteStatus === "sent" && d.linkedCustomerUserId) {
    void notifyQuoteSentToCustomer(supabase, {
      quoteId,
      customerUserId: d.linkedCustomerUserId,
      artisanName: profileBusinessName ?? "Votre artisan",
    });
  }

  return { ok: true, notifyFailed, emailSent };
}

async function markVoiceIntakeValidated(
  supabase: SupabaseClient,
  params: { voiceIntakeId: string; quoteId: string; profileId: string },
) {
  await supabase
    .from("voice_call_intakes")
    .update({ status: "validated", quote_id: params.quoteId })
    .eq("id", params.voiceIntakeId)
    .eq("artisan_id", params.profileId)
    .eq("status", "pending_review");
  revalidatePath("/app/appels");
}

export async function createQuote(formData: FormData) {
  const userAuth = await requireAuthenticatedUser();
  if (!userAuth.ok) {
    return { ok: false as const, error: "auth" as const };
  }
  const { supabase, userId } = userAuth;

  await redirectIfCannotCreateDocuments(supabase, userId);

  const resolvedProfile = await resolveArtisanProfile(supabase, userId, PROFILE_LEGAL_COLUMNS);
  if (!resolvedProfile.ok) {
    return { ok: false as const, error: "missing_profile" as const };
  }
  const { profileId, profile } = resolvedProfile;
  const profileBusinessName = profile.business_name as string | null;

  const input = await resolveQuoteInput(formData, { supabase, profileId, profile });
  if (!input.ok) return input;
  const d = input.data;

  const { data: createdQuote, error: quoteErr } = await supabase
    .from("quotes")
    .insert({
      artisan_id: profileId,
      customer_name: d.customerName || null,
      customer_email: d.customerEmail || null,
      customer_user_id: d.linkedCustomerUserId,
      conversation_id: d.linkedConversationId,
      status: d.quoteStatus,
      notes: d.notes || null,
      labor_rate_per_hour: d.laborRateCents,
      labor_duration_minutes: d.laborDurationMinutes,
      labor_total: d.laborTotalCents,
      materials_total: d.materialsTotalCents,
      grand_total: d.grandTotalCents,
      reduced_vat_rate: d.reducedVatRate,
      generate_vat_attestation: d.generateVatAttestation && (d.reducedVatRate === 5.5 || d.reducedVatRate === 10),
      work_site_address: d.workSiteAddress,
      work_site_city: d.workSiteCity,
      work_site_postal_code: d.workSitePostalCode,
      retraction_waived: d.retractionWaived,
      valid_until: d.validUntil,
      sent_at: d.quoteStatus === "sent" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (quoteErr || !createdQuote?.id) {
    return { ok: false as const, error: "create_failed" as const };
  }

  const linesResult = await writeQuoteLines(supabase, createdQuote.id, d);
  if (!linesResult.ok) return linesResult;

  const notifyResult = await notifyQuoteIfSent(supabase, {
    quoteId: createdQuote.id,
    profileId,
    userId,
    profileBusinessName,
    d,
  });
  if (!notifyResult.ok) return notifyResult;
  const { notifyFailed, emailSent } = notifyResult;

  if (d.voiceIntakeId && d.quoteStatus === "sent") {
    await markVoiceIntakeValidated(supabase, { voiceIntakeId: d.voiceIntakeId, quoteId: createdQuote.id, profileId });
  }

  revalidatePath("/app/quotes");
  revalidatePath("/mes-devis");
  return {
    ok: true as const,
    quoteId: createdQuote.id,
    notifyFailed,
    emailSent,
    status: d.quoteStatus,
  };
}

/**
 * Édite un devis existant — réservé aux brouillons (`status = 'draft'`).
 * Un devis déjà envoyé/accepté/refusé ne se modifie pas en place : c'est un
 * document formel déjà remis au client (et pour un devis accepté, la base
 * d'une éventuelle facturation) — la seule voie reste la duplication en
 * nouveau brouillon (`duplicateQuote`). Cf. audit devis Vague 5, point 4 :
 * jusqu'ici, corriger une erreur de saisie sur un brouillon obligeait à le
 * dupliquer puis à retaper la correction, sans pouvoir supprimer l'original.
 */
export async function updateQuote(quoteId: string, formData: FormData) {
  const userAuth = await requireAuthenticatedUser();
  if (!userAuth.ok) {
    return { ok: false as const, error: "auth" as const };
  }
  const { supabase, userId } = userAuth;

  await redirectIfCannotCreateDocuments(supabase, userId);

  const resolvedProfile = await resolveArtisanProfile(supabase, userId, PROFILE_LEGAL_COLUMNS);
  if (!resolvedProfile.ok) {
    return { ok: false as const, error: "missing_profile" as const };
  }
  const { profileId, profile } = resolvedProfile;
  const profileBusinessName = profile.business_name as string | null;

  const { data: existing } = await supabase
    .from("quotes")
    .select("id, artisan_id, status")
    .eq("id", quoteId)
    .maybeSingle();

  if (!existing || existing.artisan_id !== profileId) {
    return { ok: false as const, error: "not_found" as const };
  }
  if (existing.status !== "draft") {
    return { ok: false as const, error: "not_editable" as const };
  }

  const input = await resolveQuoteInput(formData, { supabase, profileId, profile });
  if (!input.ok) return input;
  const d = input.data;

  // Garde anti-course explicite : ne met à jour que si le devis est toujours
  // "draft" au moment précis de l'écriture (et pas seulement au moment de la
  // lecture ci-dessus) — même discipline que client_accept_quote.
  const { data: updated, error: updateErr } = await supabase
    .from("quotes")
    .update({
      customer_name: d.customerName || null,
      customer_email: d.customerEmail || null,
      customer_user_id: d.linkedCustomerUserId,
      conversation_id: d.linkedConversationId,
      status: d.quoteStatus,
      notes: d.notes || null,
      labor_rate_per_hour: d.laborRateCents,
      labor_duration_minutes: d.laborDurationMinutes,
      labor_total: d.laborTotalCents,
      materials_total: d.materialsTotalCents,
      grand_total: d.grandTotalCents,
      reduced_vat_rate: d.reducedVatRate,
      generate_vat_attestation: d.generateVatAttestation && (d.reducedVatRate === 5.5 || d.reducedVatRate === 10),
      work_site_address: d.workSiteAddress,
      work_site_city: d.workSiteCity,
      work_site_postal_code: d.workSitePostalCode,
      retraction_waived: d.retractionWaived,
      valid_until: d.validUntil,
      sent_at: d.quoteStatus === "sent" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", quoteId)
    .eq("artisan_id", profileId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (updateErr) {
    return { ok: false as const, error: "update_failed" as const };
  }
  if (!updated) {
    return { ok: false as const, error: "not_editable" as const };
  }

  // Remplacement intégral des lignes plutôt qu'un diff fin — plus simple (KISS) et
  // sans risque d'incohérence entre ce qu'affichait le formulaire et la base.
  // Sûr uniquement parce qu'on vient de vérifier status = 'draft' : un devis
  // envoyé n'a jamais ses lignes touchées par ce chemin.
  await supabase.from("quote_services").delete().eq("quote_id", quoteId);
  await supabase.from("quote_materials").delete().eq("quote_id", quoteId);

  const linesResult = await writeQuoteLines(supabase, quoteId, d);
  if (!linesResult.ok) return linesResult;

  const notifyResult = await notifyQuoteIfSent(supabase, { quoteId, profileId, userId, profileBusinessName, d });
  if (!notifyResult.ok) return notifyResult;
  const { notifyFailed, emailSent } = notifyResult;

  if (d.voiceIntakeId && d.quoteStatus === "sent") {
    await markVoiceIntakeValidated(supabase, { voiceIntakeId: d.voiceIntakeId, quoteId, profileId });
  }

  revalidatePath("/app/quotes");
  revalidatePath(`/app/quotes/${quoteId}`);
  revalidatePath("/mes-devis");
  return {
    ok: true as const,
    quoteId,
    notifyFailed,
    emailSent,
    status: d.quoteStatus,
  };
}

/**
 * Supprime un brouillon (jamais un devis envoyé/accepté/refusé — document
 * déjà remis au client, ne doit jamais disparaître). Cascade DB sur
 * quote_services/quote_materials (FK `on delete cascade`, cf. init.sql).
 */
export async function deleteQuote(quoteId: string) {
  const userAuth = await requireAuthenticatedUser();
  if (!userAuth.ok) {
    return { ok: false as const, error: "auth" as const };
  }
  const { supabase, userId } = userAuth;

  const resolvedProfile = await resolveArtisanProfile(supabase, userId);
  if (!resolvedProfile.ok) {
    return { ok: false as const, error: "missing_profile" as const };
  }
  const { profileId } = resolvedProfile;

  const { data: deleted, error } = await supabase
    .from("quotes")
    .delete()
    .eq("id", quoteId)
    .eq("artisan_id", profileId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false as const, error: "delete_failed" as const };
  }
  if (!deleted) {
    return { ok: false as const, error: "not_deletable" as const };
  }

  revalidatePath("/app/quotes");
  revalidatePath("/mes-devis");
  return { ok: true as const };
}
