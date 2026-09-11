import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getCivilMonthPeriod } from "@/lib/billing/civil-month-period";
import { getPlanVoiceMinutes } from "@/lib/billing/subscription-plans";

import type { VoiceQuotaSnapshot } from "./voice-quota-types";

export type { VoiceQuotaSnapshot };

type ProfileQuotaRow = {
  voice_minutes_included: number | null;
  subscription_plan: string | null;
  voice_allow_overage?: boolean | null;
};

export function buildVoiceQuotaSnapshot(input: {
  artisanId: string;
  included: number;
  used: number;
  allowOverage: boolean;
  now?: Date;
}): VoiceQuotaSnapshot {
  const { start, end } = getCivilMonthPeriod(input.now);
  const safeUsed = Math.max(0, input.used);
  const included = Math.max(0, input.included);
  const remainingMinutes = Math.max(0, included - safeUsed);
  const voiceMinutesOverdue = Math.max(0, safeUsed - included);
  const hasRemainingMinutes = remainingMinutes > 0;

  const canAcceptCalls =
    included <= 0 ? input.allowOverage : hasRemainingMinutes || input.allowOverage;

  return {
    artisanId: input.artisanId,
    voiceMinutesIncluded: included,
    voiceMinutesUsed: safeUsed,
    voiceMinutesOverdue,
    remainingMinutes,
    hasRemainingMinutes,
    allowOverage: input.allowOverage,
    canAcceptCalls,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
  };
}

function resolveIncludedMinutes(profile: ProfileQuotaRow): number {
  const fromColumn = Number(profile.voice_minutes_included ?? NaN);
  if (Number.isFinite(fromColumn) && fromColumn >= 0) return fromColumn;

  const plan = profile.subscription_plan?.trim();
  if (plan === "base" || plan === "pro" || plan === "premium") {
    return getPlanVoiceMinutes(plan);
  }
  return 0;
}

/**
 * Dérive le quota vocal du mois civil à partir de voice_call_logs.
 * En cas d'erreur, considère le quota comme épuisé (refus prudent si blocage actif).
 */
export async function resolveVoiceQuota(
  db: SupabaseClient,
  artisanId: string,
  now: Date = new Date(),
): Promise<VoiceQuotaSnapshot | null> {
  const { start, end } = getCivilMonthPeriod(now);

  const profileRes = await db
    .from("profiles")
    .select("voice_minutes_included, subscription_plan, voice_allow_overage")
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
  const included = resolveIncludedMinutes(profile);
  const allowOverage = profile.voice_allow_overage ?? true;

  const logsRes = await db
    .from("voice_call_logs")
    .select("minutes_billed")
    .eq("artisan_id", artisanId)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());

  if (logsRes.error) {
    console.error("[voice-quota] décompte voice_call_logs", {
      artisanId,
      message: logsRes.error.message,
    });
    return buildVoiceQuotaSnapshot({
      artisanId,
      included,
      used: included,
      allowOverage,
      now,
    });
  }

  const used = (logsRes.data ?? []).reduce(
    (sum, row) => sum + Math.max(0, Number(row.minutes_billed ?? 0)),
    0,
  );

  return buildVoiceQuotaSnapshot({ artisanId, included, used, allowOverage, now });
}
