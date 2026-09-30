import "server-only";

import { after } from "next/server";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SubscriptionStatus } from "@/lib/billing/subscription-access";
import {
  getPlanVoiceCalls,
  type SubscriptionPlanId,
} from "@/lib/billing/subscription-plans";
import { syncArtisanVoiceNumberMapping } from "@/lib/voice/voice-number-registry";
import { notifyVoiceNumberReleased } from "@/lib/voice/voice-number-release-notice";

export type SubscriptionVoiceSyncInput = {
  profileId: string;
  planId: SubscriptionPlanId | null;
  subscriptionStatus: SubscriptionStatus;
  /**
   * Admin : attribue même pendant un essai sans moyen de paiement.
   * Par défaut, un essai n'obtient un numéro qu'avec un abonnement Stripe (CB enregistrée).
   */
  force?: boolean;
  /** false = ne jamais déclencher d'achat Twilio (appel interne après un achat). */
  provisionIfMissing?: boolean;
};

export function planIncludesSolineVoice(planId: SubscriptionPlanId | null | undefined): boolean {
  if (!planId) return false;
  return getPlanVoiceCalls(planId) > 0;
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

export type SubscriptionVoiceSyncResult = {
  assigned: boolean;
  released: boolean;
  /** Aucun numéro disponible : l'artisan est en attente (achat déclenché sauf provisionIfMissing=false). */
  poolEmpty?: boolean;
  /** Essai sans carte enregistrée : pas de numéro (achat Twilio facturé tous les mois). */
  needsPaymentMethod?: boolean;
  provisioningScheduled?: boolean;
  error?: string;
};

/**
 * Aligne le numéro vocal de l'artisan avec son abonnement.
 *
 * 1 abonnement Pro/Premium = 1 numéro : ancien numéro récupéré s'il est encore en
 * quarantaine, sinon numéro libre du registre, sinon ACHAT Twilio déclenché juste
 * après la réponse (after) — jamais pendant le webhook Stripe.
 * Résiliation / Base : numéro en quarantaine 30 jours, puis rendu à Twilio (cron).
 */
export async function syncSubscriptionVoiceNumber(
  admin: SupabaseClient,
  input: SubscriptionVoiceSyncInput,
): Promise<SubscriptionVoiceSyncResult> {
  const result: SubscriptionVoiceSyncResult = { assigned: false, released: false };

  if (shouldReleaseVoiceNumber(input)) {
    result.released = await releaseArtisanVoiceNumberForSubscription(admin, input.profileId);
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

  if (input.subscriptionStatus === "trialing" && !input.force) {
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_subscription_id")
      .eq("id", input.profileId)
      .maybeSingle();
    if (!String(profile?.stripe_subscription_id ?? "").trim()) {
      return { ...result, needsPaymentMethod: true };
    }
  }

  // 1. Réabonnement pendant la quarantaine : l'artisan retrouve SON numéro.
  const { data: reclaimRows, error: reclaimError } = await admin.rpc("reclaim_quarantined_voice_number", {
    p_artisan_id: input.profileId,
  });
  if (reclaimError) console.error("[voice pool] reclaim failed", reclaimError.message);
  let claim = (Array.isArray(reclaimRows) ? reclaimRows[0] : reclaimRows) as ClaimRow | undefined;

  // 2. Sinon, un numéro libre du registre (acheté à la main, réparé…).
  if (!claim?.phone_e164) {
    const { data: claimRows, error: claimError } = await admin.rpc("claim_voice_number_from_pool", {
      p_artisan_id: input.profileId,
    });
    if (claimError) {
      console.error("[voice pool] claim failed", claimError.message);
      return { ...result, error: claimError.message };
    }
    claim = (Array.isArray(claimRows) ? claimRows[0] : claimRows) as ClaimRow | undefined;
  }

  // 3. Sinon, achat à la demande.
  if (!claim?.phone_e164) {
    await markVoiceNumberAssignmentPending(admin, input.profileId);
    if (input.provisionIfMissing === false) return { ...result, poolEmpty: true };
    scheduleVoiceNumberProvisioning(admin, input.profileId);
    return { ...result, poolEmpty: true, provisioningScheduled: true };
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

/**
 * Achat Twilio + ElevenLabs (5-10 s) APRÈS la réponse HTTP : le webhook Stripe
 * répond immédiatement (pas de relance Stripe = pas de double achat ; le verrou
 * par artisan couvre les événements multiples). Hors requête (script) : exécution directe.
 */
function scheduleVoiceNumberProvisioning(admin: SupabaseClient, profileId: string) {
  const run = async () => {
    try {
      // Import dynamique : évite la dépendance circulaire avec le module d'achat.
      const { provisionNumberForArtisan } = await import("@/lib/voice/voice-pool-provisioning");
      await provisionNumberForArtisan(admin, profileId);
    } catch (error) {
      console.error("[voice pool] achat à la demande", profileId, error);
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
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

  // Renvoi d'appel probablement encore actif chez l'artisan : on lui demande de le couper.
  await notifyVoiceNumberReleased(admin, { profileId, phoneE164: phone });

  return true;
}
