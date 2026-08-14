import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { LeadQualification } from "@/lib/ai/qualify-lead-schema";
import { buildLeadQuoteDraft } from "@/lib/leads/build-lead-quote-draft";
import { buildLeadRecapMessage } from "@/lib/leads/lead-recap-message";
import { LEAD_MEDIA_BUCKET } from "@/lib/leads/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type LeadRow = {
  id: string;
  status: string;
  description: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address_label: string | null;
  trade_category: string | null;
  trade: string | null;
  estimate_min: number | null;
  estimate_max: number | null;
  ai_qualification: LeadQualification | null;
};

type MatchRow = {
  id: string;
  artisan_id: string;
  conversation_id: string | null;
  rank: number;
};

type MediaRow = {
  storage_path: string;
  kind: "photo" | "video";
};

export type DispatchLeadResult =
  | { ok: true; dispatched: number; skipped: number }
  | { ok: false; error: string };

/**
 * Pousse le lead aux artisans déjà matchés : conversation, message récap,
 * pièces jointes, brouillon de devis. Idempotent (ignore les matchs déjà envoyés).
 */
export async function dispatchLeadToArtisans(token: string): Promise<DispatchLeadResult> {
  const admin = createSupabaseServiceRoleClient();
  if (!admin) {
    console.error("[dispatch-lead] SUPABASE_SERVICE_ROLE_KEY manquante");
    return { ok: false, error: "dispatch_unavailable" };
  }

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .select(
      "id, status, description, contact_name, contact_email, contact_phone, address_label, trade_category, trade, estimate_min, estimate_max, ai_qualification",
    )
    .eq("public_token", token)
    .maybeSingle();

  if (leadError || !lead) return { ok: false, error: "lead_not_found" };
  const leadRow = lead as LeadRow;

  if (!leadRow.contact_name?.trim()) return { ok: false, error: "missing_contact" };
  if (!leadRow.description?.trim()) return { ok: false, error: "missing_description" };
  if (leadRow.status === "expired" || leadRow.status === "converted") {
    return { ok: false, error: "lead_closed" };
  }

  const { data: matches, error: matchError } = await admin
    .from("lead_matches")
    .select("id, artisan_id, conversation_id, rank")
    .eq("lead_id", leadRow.id)
    .order("rank", { ascending: true });

  if (matchError || !matches?.length) return { ok: false, error: "no_matches" };

  const pending = (matches as MatchRow[]).filter((m) => !m.conversation_id);
  if (!pending.length) {
    return { ok: true, dispatched: 0, skipped: matches.length };
  }

  const { data: mediaRows } = await admin
    .from("lead_media")
    .select("storage_path, kind")
    .eq("lead_id", leadRow.id);

  const media = (mediaRows ?? []) as MediaRow[];

  let customerUserId: string | null = null;
  if (leadRow.contact_email) {
    const { data: uid } = await admin.rpc("user_id_by_email", {
      p_email: leadRow.contact_email,
    });
    if (typeof uid === "string") customerUserId = uid;
  }

  let dispatched = 0;

  for (const match of pending) {
    const sent = await dispatchToArtisan(admin, {
      lead: leadRow,
      match,
      media,
      customerUserId,
    });
    if (sent) dispatched += 1;
  }

  if (dispatched > 0) {
    await admin
      .from("leads")
      .update({ status: "submitted" })
      .eq("id", leadRow.id)
      .in("status", ["matched", "estimated", "new"]);
  }

  return {
    ok: true,
    dispatched,
    skipped: matches.length - pending.length,
  };
}

async function dispatchToArtisan(
  admin: SupabaseClient,
  input: {
    lead: LeadRow;
    match: MatchRow;
    media: MediaRow[];
    customerUserId: string | null;
  },
): Promise<boolean> {
  const { lead, match, media, customerUserId } = input;

  const { data: profile } = await admin
    .from("profiles")
    .select("id, user_id, business_name, description, labor_rate_per_hour")
    .eq("id", match.artisan_id)
    .maybeSingle();

  if (!profile?.id) return false;

  const conversationId = await ensureLeadConversation(admin, {
    artisanId: profile.id,
    leadId: lead.id,
    customerUserId,
  });
  if (!conversationId) return false;

  const recapBody = buildLeadRecapMessage({
    contactName: lead.contact_name!.trim(),
    contactEmail: lead.contact_email,
    contactPhone: lead.contact_phone,
    description: lead.description,
    addressLabel: lead.address_label,
    tradeCategory: lead.trade_category,
    trade: lead.trade,
    estimateMin: lead.estimate_min,
    estimateMax: lead.estimate_max,
    qualification: lead.ai_qualification,
    mediaCount: media.length,
  });

  const { data: message, error: messageError } = await admin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_user_id: null,
      kind: "lead_recap",
      body: recapBody,
    })
    .select("id")
    .single();

  if (messageError || !message?.id) {
    console.error("[dispatch-lead] message", messageError?.message);
    return false;
  }

  if (media.length) {
    const attachmentRows = media.map((m) => ({
      message_id: message.id,
      storage_bucket: LEAD_MEDIA_BUCKET,
      storage_path: m.storage_path,
      kind: m.kind,
      file_name: m.storage_path.split("/").pop() ?? null,
      mime_type: m.kind === "video" ? "video/mp4" : "image/jpeg",
    }));
    const { error: attachError } = await admin.from("message_attachments").insert(attachmentRows);
    if (attachError) console.error("[dispatch-lead] attachments", attachError.message);
  }

  let quoteDraft = null;
  try {
    quoteDraft = await buildLeadQuoteDraft({
      supabase: admin,
      leadMatchId: match.id,
      artisanId: profile.id,
      profile: {
        business_name: profile.business_name,
        description: profile.description,
        labor_rate_per_hour: profile.labor_rate_per_hour,
      },
      lead: {
        description: lead.description,
        contact_name: lead.contact_name,
        contact_email: lead.contact_email,
        estimate_min: lead.estimate_min,
        estimate_max: lead.estimate_max,
        trade_category: lead.trade_category,
        trade: lead.trade,
        ai_qualification: lead.ai_qualification,
      },
    });
  } catch (err) {
    console.error("[dispatch-lead] quote draft", err instanceof Error ? err.message : err);
  }

  const { error: updateError } = await admin
    .from("lead_matches")
    .update({
      conversation_id: conversationId,
      quote_draft: quoteDraft,
      quote_draft_created: quoteDraft != null,
    })
    .eq("id", match.id)
    .is("conversation_id", null);

  if (updateError) {
    console.error("[dispatch-lead] lead_matches update", updateError.message);
    return false;
  }

  return true;
}

async function ensureLeadConversation(
  admin: SupabaseClient,
  input: { artisanId: string; leadId: string; customerUserId: string | null },
): Promise<string | null> {
  const { data: existing } = await admin
    .from("conversations")
    .select("id")
    .eq("artisan_id", input.artisanId)
    .eq("lead_id", input.leadId)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await admin
    .from("conversations")
    .insert({
      artisan_id: input.artisanId,
      lead_id: input.leadId,
      customer_user_id: input.customerUserId,
    })
    .select("id")
    .single();

  if (error || !created?.id) {
    console.error("[dispatch-lead] conversation", error?.message);
    return null;
  }

  return created.id;
}
