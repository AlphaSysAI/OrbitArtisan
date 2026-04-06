"use server";

import { revalidatePath } from "next/cache";

import { sendMessage } from "@/lib/messages/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ParsedMaterial = {
  label: string;
  quantity: number; // integer
  unitPriceCents: number; // integer
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
      const unitPriceCents = parseEurToCents(String(m?.unit_price_eur ?? ""));
      return { label, quantity, unitPriceCents: unitPriceCents ?? NaN };
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

  const materialsTotalCents = materials.reduce((acc, m) => acc + m.quantity * m.unitPriceCents, 0);
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

  const quoteStatus = linkedConversationId && linkedCustomerUserId ? "sent" : "draft";

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
    })
    .select("id")
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
    }));

  if (quoteMaterialRows.length) {
    const { error: materialsLinesErr } = await supabase
      .from("quote_materials")
      .insert(quoteMaterialRows);
    if (materialsLinesErr) return { ok: false as const, error: "materials_failed" as const };
  }

  let notifyFailed = false;
  if (linkedConversationId) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const totalFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
      grandTotalCents / 100,
    );
    const body = `📋 J’ai préparé un devis pour toi — Total : ${totalFmt}. Consulte-le ici : ${siteUrl}/mes-devis/${createdQuote.id}`;
    const sent = await sendMessage(linkedConversationId, body);
    if (!sent.ok) notifyFailed = true;
  }

  revalidatePath("/app/quotes");
  revalidatePath("/mes-devis");
  return { ok: true as const, quoteId: createdQuote.id, notifyFailed };
}

