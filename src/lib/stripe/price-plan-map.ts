import type { BillingInterval, SubscriptionPlanId } from "@/lib/billing/subscription-plans";

export type PlanMatch = { planId: SubscriptionPlanId; interval: BillingInterval };

const PLANS: SubscriptionPlanId[] = ["base", "pro", "premium"];
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
