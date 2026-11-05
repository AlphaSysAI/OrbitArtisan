import { SUBSCRIPTION_PLAN_IDS, type BillingInterval, type SubscriptionPlanId } from "@/lib/billing/subscription-plans";

export type PlanMatch = { planId: SubscriptionPlanId; interval: BillingInterval };

const PLANS: readonly SubscriptionPlanId[] = SUBSCRIPTION_PLAN_IDS;
const INTERVALS: BillingInterval[] = ["monthly", "annual"];

/** Formule d'un prix Stripe d'après les variables `STRIPE_PRICE_<PLAN>_<INTERVAL>`. */
export function planFromPriceIdEnv(
  priceId: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): PlanMatch | null {
  const id = priceId?.trim();
  if (!id) return null;
  for (const planId of PLANS) {
    for (const interval of INTERVALS) {
      if (env[`STRIPE_PRICE_${planId.toUpperCase()}_${interval.toUpperCase()}`]?.trim() === id) {
        return { planId, interval };
      }
    }
  }
  return null;
}

/** Clé fixe (`lookup_key`) du prix Stripe d'une formule : `solinebtp_pro_monthly`, etc. */
export function subscriptionLookupKey(planId: SubscriptionPlanId, interval: BillingInterval): string {
  return `solinebtp_${planId}_${interval}`;
}

/** Formule d'un prix Stripe d'après sa clé fixe. */
export function planFromLookupKey(lookupKey: string | null | undefined): PlanMatch | null {
  const key = lookupKey?.trim();
  if (!key) return null;
  for (const planId of PLANS) {
    for (const interval of INTERVALS) {
      if (subscriptionLookupKey(planId, interval) === key) return { planId, interval };
    }
  }
  return null;
}
