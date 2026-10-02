import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AnonymizedLeadSummary } from "@/lib/concierge/summary";

type InviteView = {
  id: string;
  token: string;
  prospectId: string;
  prospectName: string;
  leadId: string | null;
  leadToken: string | null;
  leadOpen: boolean;
  summary: AnonymizedLeadSummary | null;
  claimedProfileId: string | null;
  expired: boolean;
};

export async function loadInvite(db: SupabaseClient, token: string): Promise<InviteView | null> {
  if (!/^[0-9a-f]{36}$/.test(token)) return null;
  const { data: inv } = await db
    .from("concierge_invites")
    .select("id, token, prospect_id, lead_id, claimed_profile_id, expires_at, prospect_artisans(business_name, opt_out)")
    .eq("token", token)
    .maybeSingle();
  if (!inv) return null;
  const prospect = inv.prospect_artisans as unknown as { business_name: string; opt_out: boolean } | null;
  if (!prospect || prospect.opt_out) return null;

  let leadToken: string | null = null;
  let leadOpen = false;
  let summary: AnonymizedLeadSummary | null = null;
  if (inv.lead_id) {
    const [{ data: lead }, { data: alert }] = await Promise.all([
      db.from("leads").select("public_token, status, expires_at").eq("id", inv.lead_id).maybeSingle(),
      db.from("concierge_alerts").select("summary").eq("lead_id", inv.lead_id).maybeSingle(),
    ]);
    leadToken = (lead?.public_token as string | undefined) ?? null;
    leadOpen = Boolean(lead) && !["expired", "converted"].includes(lead!.status as string) && new Date(lead!.expires_at as string).getTime() > Date.now();
    summary = (alert?.summary as AnonymizedLeadSummary | null) ?? null;
  }
  return {
    id: inv.id as string,
    token: inv.token as string,
    prospectId: inv.prospect_id as string,
    prospectName: prospect.business_name,
    leadId: (inv.lead_id as string | null) ?? null,
    leadToken,
    leadOpen,
    summary,
    claimedProfileId: (inv.claimed_profile_id as string | null) ?? null,
    expired: new Date(inv.expires_at as string).getTime() < Date.now(),
  };
}

type ClaimResult = { ok: true; conversationId: string | null } | { ok: false; error: "invalid" | "expired" | "taken" | "lead_closed" | "full" };

/**
 * Le prospect s'est inscrit : on lui attribue le chantier (rang libre parmi 3),
 * puis la mécanique normale pousse le récap + le contact du particulier dans sa messagerie.
 */
export async function claimInvite(
  db: SupabaseClient,
  invite: InviteView,
  profile: { id: string; latitude: number | null; longitude: number | null },
  dispatch: (leadToken: string) => Promise<unknown>,
): Promise<ClaimResult> {
  if (invite.claimedProfileId && invite.claimedProfileId !== profile.id) return { ok: false, error: "taken" };
  if (invite.expired && !invite.claimedProfileId) return { ok: false, error: "expired" };

  await db
    .from("prospect_artisans")
    .update({ status: "converted", converted_profile_id: profile.id })
    .eq("id", invite.prospectId)
    .eq("opt_out", false);
  await db
    .from("concierge_invites")
    .update({ claimed_at: new Date().toISOString(), claimed_profile_id: profile.id })
    .eq("id", invite.id)
    .is("claimed_profile_id", null);

  if (!invite.leadId || !invite.leadToken) return { ok: true, conversationId: null };
  if (!invite.leadOpen) return { ok: false, error: "lead_closed" };

  const { data: existing } = await db.from("lead_matches").select("artisan_id, rank, conversation_id").eq("lead_id", invite.leadId);
  const mine = existing?.find((m) => m.artisan_id === profile.id);
  if (!mine) {
    const used = new Set((existing ?? []).map((m) => m.rank as number));
    const rank = [1, 2, 3].find((r) => !used.has(r));
    if (!rank) return { ok: false, error: "full" };
    const { data: lead } = await db.from("leads").select("latitude, longitude").eq("id", invite.leadId).maybeSingle();
    const distance =
      lead?.latitude != null && profile.latitude != null && profile.longitude != null
        ? haversineKm(lead.latitude as number, lead.longitude as number, profile.latitude, profile.longitude)
        : null;
    const { error } = await db
      .from("lead_matches")
      .insert({ lead_id: invite.leadId, artisan_id: profile.id, rank, distance_km: distance !== null ? Math.round(distance * 100) / 100 : null });
    if (error) return { ok: false, error: "full" };
  }

  await dispatch(invite.leadToken);
  const { data: match } = await db
    .from("lead_matches")
    .select("conversation_id")
    .eq("lead_id", invite.leadId)
    .eq("artisan_id", profile.id)
    .maybeSingle();
  return { ok: true, conversationId: (match?.conversation_id as string | null) ?? null };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}
