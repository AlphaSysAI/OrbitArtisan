import type { SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import { getPlanVoiceMinutes } from "@/lib/billing/subscription-plans";

/** Formules avec secrétaire vocale Soline (minutes incluses). */
export function planIncludesSolineVoice(planId: string | null | undefined): boolean {
  const plan = (planId ?? "base").trim() as SubscriptionPlanId;
  if (plan !== "pro" && plan !== "premium") return false;
  return getPlanVoiceMinutes(plan) > 0;
}

export const SOLINE_SUBSCRIPTION_SETTINGS_HREF = "/app/reglages?tab=abonnement";

/** Entrée « Appels Soline » : liste des appels ou page abonnements. */
export function solineCallsDestination(planId: string | null | undefined): string {
  return planIncludesSolineVoice(planId) ? "/app/appels" : SOLINE_SUBSCRIPTION_SETTINGS_HREF;
}

export const SOLINE_CALLS_HUB_PATH = "/app/soline";
