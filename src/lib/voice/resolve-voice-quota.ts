import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getCivilMonthPeriod } from "@/lib/billing/civil-month-period";
import {
  getPlanOverageCallCents,
  getPlanVoiceCalls,
  isSubscriptionPlanId,
  SOLINE_BILLABLE_CALL_MIN_SECONDS,
  SOLINE_DEFAULT_OVERAGE_CAP_CENTS,
  SOLINE_TRIAL_CALLS_INCLUDED,
} from "@/lib/billing/subscription-plans";

import type { SolineVoiceMode, VoiceQuotaSnapshot } from "./voice-quota-types";

export type { VoiceQuotaSnapshot };

export type VoiceEntitlementInput = {
  subscription_plan: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
};

export type VoiceEntitlement = {
  isTrial: boolean;
  callsIncluded: number;
  overageCallCents: number;
};

/**
 * Droits vocaux dérivés de la grille (source unique : subscription-plans.ts).
 * Essai : forfait réduit, sans dépassement. Résilié / essai expiré : aucun appel inclus.
 */
export function resolveVoiceEntitlement(
  profile: VoiceEntitlementInput,
  now: Date = new Date(),
): VoiceEntitlement {
  const plan = profile.subscription_plan?.trim();
  if (!isSubscriptionPlanId(plan)) return { isTrial: false, callsIncluded: 0, overageCallCents: 0 };

  const status = profile.subscription_status ?? "trialing";
  const planCalls = getPlanVoiceCalls(plan);

  if (status === "trialing") {
    const endsAt = profile.trial_ends_at ? new Date(profile.trial_ends_at).getTime() : 0;
    const trialActive = endsAt > now.getTime();
    return {
      isTrial: true,
      callsIncluded: trialActive && planCalls > 0 ? SOLINE_TRIAL_CALLS_INCLUDED : 0,
      overageCallCents: 0,
    };
  }

  if (status === "active" || status === "past_due") {
    return { isTrial: false, callsIncluded: planCalls, overageCallCents: getPlanOverageCallCents(plan) };
  }

  return { isTrial: false, callsIncluded: 0, overageCallCents: 0 };
}

/** Un appel compte s'il a abouti et duré au moins 30 s. */
export function isBillableCall(status: string | null | undefined, durationSeconds: number | null | undefined): boolean {
  return (
    (status ?? "").trim().toLowerCase() === "completed" &&
    Number(durationSeconds ?? 0) >= SOLINE_BILLABLE_CALL_MIN_SECONDS
  );
}

export function buildVoiceQuotaSnapshot(input: {
  artisanId: string;
  entitlement: VoiceEntitlement;
  callsUsed: number;
  overageCapCents: number;
  now?: Date;
}): VoiceQuotaSnapshot {
  const { start, end } = getCivilMonthPeriod(input.now);
  const { isTrial, callsIncluded, overageCallCents } = input.entitlement;
  const callsUsed = Math.max(0, Math.floor(input.callsUsed));
  const cap = Math.max(0, Math.floor(input.overageCapCents));
  const remainingCalls = Math.max(0, callsIncluded - callsUsed);
  const overageCalls = Math.max(0, callsUsed - callsIncluded);
  const overageAmountCents = Math.min(overageCalls * overageCallCents, cap);

  let mode: SolineVoiceMode = "full";
  if (callsIncluded <= 0) {
    mode = "message_only";
  } else if (remainingCalls === 0) {
    // Plus de forfait : on continue en mode complet tant que l'appel suivant tient sous le plafond.
    const nextCallFits = overageCallCents > 0 && (overageCalls + 1) * overageCallCents <= cap;
    mode = nextCallFits ? "full" : "message_only";
  }

  return {
    artisanId: input.artisanId,
    isTrial,
    callsIncluded,
    callsUsed,
    remainingCalls,
    overageCalls,
    overageCallCents,
    overageCapCents: cap,
    overageAmountCents,
    mode,
    canAcceptCalls: true,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
  };
}

type ProfileQuotaRow = VoiceEntitlementInput & { voice_overage_cap_cents?: number | null };

/** Nombre d'appels facturables d'un artisan sur une période [start, end[. */
export async function countBillableCalls(
  db: SupabaseClient,
  artisanId: string,
  start: Date,
  end: Date,
): Promise<number | null> {
  const { count, error } = await db
    .from("voice_call_logs")
    .select("id", { count: "exact", head: true })
    .eq("artisan_id", artisanId)
    .eq("status", "completed")
    .gte("duration_seconds", SOLINE_BILLABLE_CALL_MIN_SECONDS)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());

  if (error) {
    console.error("[voice-quota] décompte voice_call_logs", { artisanId, message: error.message });
    return null;
  }
  return count ?? 0;
}

/**
 * Quota du mois civil, dérivé de voice_call_logs.
 * En cas d'erreur de décompte : mode message seul (prudent, sans couper la ligne).
 */
export async function resolveVoiceQuota(
  db: SupabaseClient,
  artisanId: string,
  now: Date = new Date(),
): Promise<VoiceQuotaSnapshot | null> {
  const { start, end } = getCivilMonthPeriod(now);

  const profileRes = await db
    .from("profiles")
    .select("subscription_plan, subscription_status, trial_ends_at, voice_overage_cap_cents")
    .eq("id", artisanId)
    .maybeSingle();

  if (profileRes.error || !profileRes.data) {
    console.error("[voice-quota] profil introuvable", {
      artisanId,
      message: profileRes.error?.message ?? "missing",
    });
    return null;
  }

  const profile = profileRes.data as ProfileQuotaRow;
  const entitlement = resolveVoiceEntitlement(profile, now);
  const overageCapCents = profile.voice_overage_cap_cents ?? SOLINE_DEFAULT_OVERAGE_CAP_CENTS;

  const used = await countBillableCalls(db, artisanId, start, end);

  return buildVoiceQuotaSnapshot({
    artisanId,
    entitlement,
    // Décompte indisponible : on considère le forfait et le plafond consommés.
    callsUsed: used ?? Number.MAX_SAFE_INTEGER,
    overageCapCents: used == null ? 0 : overageCapCents,
    now,
  });
}
