import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SubscriptionStatus } from "@/lib/billing/subscription-access";
import {
  getPlanVoiceMinutes,
  type SubscriptionPlanId,
} from "@/lib/billing/subscription-plans";
import { syncArtisanVoiceNumberMapping } from "@/lib/voice/voice-number-registry";

export type SubscriptionVoiceSyncInput = {
  profileId: string;
  planId: SubscriptionPlanId | null;
  subscriptionStatus: SubscriptionStatus;
};

export function planIncludesSolineVoice(planId: SubscriptionPlanId | null | undefined): boolean {
  if (!planId) return false;
  return getPlanVoiceMinutes(planId) > 0;
}

/** Abonnement actif, essai ou impayé : on conserve / peut attribuer un numéro. */
export function subscriptionStatusKeepsVoiceNumber(status: SubscriptionStatus): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

export function shouldAutoAssignVoiceNumber(input: SubscriptionVoiceSyncInput): boolean {
  return (
    planIncludesSolineVoice(input.planId) && subscriptionStatusKeepsVoiceNumber(input.subscriptionStatus)
  );
}

export function shouldReleaseVoiceNumber(input: SubscriptionVoiceSyncInput): boolean {
  if (input.subscriptionStatus === "canceled") return true;
  if (!planIncludesSolineVoice(input.planId)) return true;
  return false;
}

async function markVoiceNumberAssignmentPending(
  admin: SupabaseClient,
  profileId: string,
): Promise<void> {
  const { error } = await admin
    .from("profiles")
    .update({
      voice_number_assignment_pending_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);
  if (error && !error.message.includes("voice_number_assignment_pending_at")) {
    console.error("[voice pool] pending flag", error.message);
  }
}

export async function clearVoiceNumberAssignmentPending(
  admin: SupabaseClient,
  profileId: string,
): Promise<void> {
  const { error } = await admin
    .from("profiles")
    .update({
      voice_number_assignment_pending_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);
  if (error && !error.message.includes("voice_number_assignment_pending_at")) {
    console.error("[voice pool] clear pending", error.message);
  }
}

type ClaimRow = { pool_id: string; phone_e164: string };

/**
 * Aligne le numéro vocal de l'artisan avec son abonnement :
 * attribution depuis le pool (Pro/Premium) ou libération (Base / résiliation).
 */
export async function syncSubscriptionVoiceNumber(
  admin: SupabaseClient,
  input: SubscriptionVoiceSyncInput,
): Promise<{ assigned: boolean; released: boolean; poolEmpty?: boolean; error?: string }> {
  const result = { assigned: false, released: false, poolEmpty: false as boolean | undefined };

  if (shouldReleaseVoiceNumber(input)) {
    const released = await releaseArtisanVoiceNumberForSubscription(admin, input.profileId);
    result.released = released;
    return result;
  }

  if (!shouldAutoAssignVoiceNumber(input)) {
    return result;
  }

  const { data: existing } = await admin
    .from("artisan_voice_numbers")
    .select("phone_e164")
    .eq("artisan_id", input.profileId)
    .maybeSingle();

  if (existing?.phone_e164) {
    await clearVoiceNumberAssignmentPending(admin, input.profileId);
    return result;
  }

  const { data: claimRows, error: claimError } = await admin.rpc("claim_voice_number_from_pool", {
    p_artisan_id: input.profileId,
  });

  if (claimError) {
    console.error("[voice pool] claim failed", claimError.message);
    return { ...result, error: claimError.message };
  }

  const claim = (Array.isArray(claimRows) ? claimRows[0] : claimRows) as ClaimRow | undefined;
  if (!claim?.phone_e164) {
    console.warn("[voice pool] aucun numéro disponible", { profileId: input.profileId });
    await markVoiceNumberAssignmentPending(admin, input.profileId);
    return { ...result, poolEmpty: true };
  }

  const sync = await syncArtisanVoiceNumberMapping({
    supabase: admin,
    artisanId: input.profileId,
    phoneE164: claim.phone_e164,
    assignedBy: "subscription_auto",
    releaseReasonWhenCleared: "subscription_ended",
  });

  if (!sync.ok) {
    await admin.rpc("release_voice_number_from_pool", {
      p_artisan_id: input.profileId,
      p_phone_e164: claim.phone_e164,
    });
    console.error("[voice pool] mapping failed after claim", sync.error);
    return { ...result, error: sync.error };
  }

  await clearVoiceNumberAssignmentPending(admin, input.profileId);
  result.assigned = true;
  return result;
}

async function releaseArtisanVoiceNumberForSubscription(
  admin: SupabaseClient,
  profileId: string,
): Promise<boolean> {
  const { data: mapping } = await admin
    .from("artisan_voice_numbers")
    .select("phone_e164")
    .eq("artisan_id", profileId)
    .maybeSingle();

  const phone = (mapping?.phone_e164 as string | undefined)?.trim();
  if (!phone) {
    await admin.rpc("release_voice_number_from_pool", {
      p_artisan_id: profileId,
      p_phone_e164: null,
    });
    return false;
  }

  await admin.rpc("release_voice_number_from_pool", {
    p_artisan_id: profileId,
    p_phone_e164: phone,
  });

  const sync = await syncArtisanVoiceNumberMapping({
    supabase: admin,
    artisanId: profileId,
    phoneE164: null,
    assignedBy: "subscription_auto",
    releaseReasonWhenCleared: "subscription_ended",
  });

  if (!sync.ok) {
    console.error("[voice pool] release mapping failed", sync.error);
  }

  return true;
}
