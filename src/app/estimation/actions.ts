"use server";

import { qualifyLead } from "@/lib/ai/qualify-lead";
import type { LeadQualification } from "@/lib/ai/qualify-lead-schema";
import type { LeadChatMessage } from "@/lib/leads/chat-schema";
import { prepareLeadClientSignup } from "@/lib/leads/client-signup";
import type { LeadSignupOffer } from "@/lib/leads/client-signup-types";
import { dispatchLeadToArtisans } from "@/lib/leads/dispatch-lead";
import { estimateLeadRange } from "@/lib/leads/estimate";
import { buildEstimate, resolvePricingContext } from "@/lib/leads/pricing";
import {
  LEAD_MEDIA_BUCKET,
  type LeadEstimate,
  type LeadSession,
  type MatchedArtisan,
} from "@/lib/leads/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findTrade, findTradeCategory, isValidTradeSelection } from "@/lib/trades/taxonomy";

/**
 * Tunnel d'estimation public : le prospect n'a pas de compte. Toutes les
 * écritures passent par les RPC `security definer` de lead_qualification.sql,
 * authentifiées par le jeton porteur renvoyé à la création du lead.
 */

const MATCH_RADIUS_KM = 40;

type Fail = { ok: false; error: string };

function fail(error: string): Fail {
  return { ok: false, error };
}

export async function startLead(input: {
  categoryId: string;
  tradeId: string;
  originArtisanSlug?: string | null;
}): Promise<{ ok: true; session: LeadSession } | Fail> {
  if (!isValidTradeSelection(input.categoryId, input.tradeId)) {
    return fail("invalid_trade");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_lead", {
    p_source: input.originArtisanSlug ? "artisan_widget" : "direct",
    p_origin_artisan_slug: input.originArtisanSlug ?? null,
    p_trade_category: input.categoryId,
    p_trade: input.tradeId,
    p_description: "",
    p_lat: null,
    p_lng: null,
    p_address_label: null,
  });

  if (error) {
    console.error("[estimation] create_lead", error.message);
    return fail("create_failed");
  }

  const payload = data as { lead_id?: string; public_token?: string } | null;
  if (!payload?.lead_id || !payload.public_token) return fail("create_failed");

  return { ok: true, session: { leadId: payload.lead_id, token: payload.public_token } };
}

export async function saveLeadBrief(input: {
  token: string;
  description?: string | null;
  categoryId?: string | null;
  tradeId?: string | null;
  lat?: number | null;
  lng?: number | null;
  addressLabel?: string | null;
}): Promise<{ ok: true } | Fail> {
  if (input.categoryId && !isValidTradeSelection(input.categoryId, input.tradeId)) {
    return fail("invalid_trade");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("update_lead_brief", {
    p_token: input.token,
    p_description: input.description ?? null,
    p_trade_category: input.categoryId ?? null,
    p_trade: input.tradeId ?? null,
    p_lat: input.lat ?? null,
    p_lng: input.lng ?? null,
    p_address_label: input.addressLabel ?? null,
  });

  if (error) {
    console.error("[estimation] update_lead_brief", error.message);
    return fail("save_failed");
  }
  const payload = data as { ok?: boolean; error?: string } | null;
  if (!payload?.ok) return fail(payload?.error ?? "save_failed");
  return { ok: true };
}

/**
 * URL de téléversement signée pour un média. Le chemin est dérivé du jeton
 * côté serveur : le navigateur ne choisit pas dans quel dossier il écrit.
 */
export async function createLeadUploadUrl(input: {
  token: string;
  fileName: string;
}): Promise<{ ok: true; path: string; signedToken: string } | Fail> {
  const supabase = await createSupabaseServerClient();

  const { data: leadId, error: idError } = await supabase.rpc("lead_id_from_token", {
    p_token: input.token,
  });
  if (idError || typeof leadId !== "string") return fail("lead_not_found");

  const extension = (input.fileName.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${leadId}/${crypto.randomUUID()}${extension ? `.${extension}` : ""}`;

  const { data, error } = await supabase.storage.from(LEAD_MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data?.token) {
    console.error("[estimation] createSignedUploadUrl", error?.message);
    return fail("upload_url_failed");
  }

  return { ok: true, path, signedToken: data.token };
}

export async function registerLeadMedia(input: {
  token: string;
  path: string;
  kind: "photo" | "video";
}): Promise<{ ok: true } | Fail> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("add_lead_media", {
    p_token: input.token,
    p_storage_path: input.path,
    p_kind: input.kind,
  });

  if (error) {
    console.error("[estimation] add_lead_media", error.message);
    return fail("media_failed");
  }
  const payload = data as { ok?: boolean; error?: string } | null;
  if (!payload?.ok) return fail(payload?.error ?? "media_failed");
  return { ok: true };
}

/**
 * Fourchette indicative + sélection de 2 à 3 artisans.
 *
 * La mise en relation passe en premier : ce sont les tarifs des artisans
 * retenus qui servent de base au chiffrage.
 */
export async function finalizeLead(input: {
  token: string;
  categoryId: string;
  tradeId?: string | null;
  description: string;
  mediaCount: number;
  messages?: LeadChatMessage[];
}): Promise<{ ok: true; estimate: LeadEstimate; artisans: MatchedArtisan[] } | Fail> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("match_lead_to_artisans", {
    p_token: input.token,
    p_radius_km: MATCH_RADIUS_KM,
    p_limit: 3,
  });
  if (error) {
    console.error("[estimation] match_lead_to_artisans", error.message);
    return fail("match_failed");
  }

  const payload = data as
    | {
        ok?: boolean;
        error?: string;
        matches?: {
          artisan_id: string;
          business_name: string;
          slug: string;
          distance_km: number | null;
          rank: number;
        }[];
      }
    | null;

  const noArtisan = !payload?.ok && payload?.error === "no_artisan_nearby";
  if (!payload?.ok && !noArtisan) {
    return fail(payload?.error ?? "match_failed");
  }

  const matches = noArtisan ? [] : (payload?.matches ?? []);

  const estimate = await computeLeadEstimate(supabase, {
    token: input.token,
    categoryId: input.categoryId,
    tradeId: input.tradeId ?? null,
    description: input.description,
    mediaCount: input.mediaCount,
    messages: input.messages,
    artisanIds: matches.map((m) => m.artisan_id),
  });

  // Estimation valable même sans artisan disponible autour.
  if (!matches.length) return { ok: true, estimate, artisans: [] };

  // `profiles` est en lecture publique : on complète la fiche affichée.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, city, logo_url")
    .in(
      "id",
      matches.map((m) => m.artisan_id),
    );

  const extraById = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  const artisans: MatchedArtisan[] = matches
    .map((m) => ({
      id: m.artisan_id,
      businessName: m.business_name,
      slug: m.slug,
      distanceKm: m.distance_km,
      rank: m.rank,
      city: (extraById.get(m.artisan_id)?.city as string | null) ?? null,
      logoUrl: (extraById.get(m.artisan_id)?.logo_url as string | null) ?? null,
    }))
    .sort((a, b) => a.rank - b.rank);

  return { ok: true, estimate, artisans };
}

/**
 * Qualification IA + chiffrage, persistés sur le lead. Si l'IA est
 * indisponible, on retombe sur l'heuristique par mots-clés : le prospect voit
 * toujours une fourchette.
 */
async function computeLeadEstimate(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  input: {
    token: string;
    categoryId: string;
    tradeId: string | null;
    description: string;
    mediaCount: number;
    messages?: LeadChatMessage[];
    artisanIds: string[];
  },
): Promise<LeadEstimate> {
  let estimate: LeadEstimate | null = null;
  let qualification: LeadQualification | null = null;

  try {
    qualification = await qualifyLead({
      description: input.description,
      categoryLabel: findTradeCategory(input.categoryId)?.label ?? null,
      tradeLabel: findTrade(input.categoryId, input.tradeId)?.label ?? null,
      messages: input.messages,
      mediaCount: input.mediaCount,
    });

    const pricing = await resolvePricingContext(supabase, {
      artisanIds: input.artisanIds,
      categoryId: input.categoryId,
    });
    estimate = buildEstimate(qualification, pricing);
  } catch (err) {
    console.error("[estimation] qualification IA", err instanceof Error ? err.message : err);
  }

  if (!estimate) {
    estimate = estimateLeadRange({
      categoryId: input.categoryId,
      description: input.description,
      mediaCount: input.mediaCount,
    });
  }

  const { error } = await supabase.rpc("set_lead_estimate", {
    p_token: input.token,
    p_min: estimate.min,
    p_max: estimate.max,
    p_qualification: qualification,
  });
  if (error) console.error("[estimation] set_lead_estimate", error.message);

  return estimate;
}

export async function submitLeadContact(input: {
  token: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}): Promise<
  | { ok: true; warning?: "no_artisans" | "dispatch_pending"; signup?: LeadSignupOffer }
  | Fail
> {
  const name = input.name.trim();
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;

  if (name.length < 2) return fail("invalid_name");
  if (!email && !phone) return fail("missing_contact");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail("invalid_email");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("update_lead_contact", {
    p_token: input.token,
    p_name: name,
    p_email: email,
    p_phone: phone,
  });

  if (error) {
    console.error("[estimation] update_lead_contact", error.message);
    return fail("contact_failed");
  }
  const payload = data as { ok?: boolean; error?: string } | null;
  if (!payload?.ok) return fail(payload?.error ?? "contact_failed");

  const dispatch = await dispatchLeadToArtisans(input.token);
  let warning: "no_artisans" | "dispatch_pending" | undefined;
  if (!dispatch.ok) {
    console.error("[estimation] dispatch-lead", dispatch.error);
    if (dispatch.error === "no_matches") warning = "no_artisans";
    else if (dispatch.error === "dispatch_unavailable") warning = "dispatch_pending";
  }

  const signup = email ? await prepareLeadClientSignup(input.token) : undefined;

  return { ok: true, warning, signup };
}
