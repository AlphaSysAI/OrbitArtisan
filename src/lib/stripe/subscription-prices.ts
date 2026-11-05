import "server-only";

import type Stripe from "stripe";

import type { BillingInterval, SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import {
  planFromLookupKey,
  planFromPriceIdEnv,
  subscriptionLookupKey,
  type PlanMatch,
} from "@/lib/stripe/price-plan-map";

const priceIdCache = new Map<string, string>();
const planCache = new Map<string, PlanMatch | null>();

/**
 * Prix Stripe actif d'une formule, retrouvé par sa clé fixe
 * (`solinebtp_<plan>_<interval>`, réglée sur le prix dans Stripe). Changer de
 * tarif = créer un nouveau prix avec la même clé (transfert), sans toucher au code
 * ni aux variables Vercel.
 */
export async function resolveSubscriptionPriceId(
  stripe: Stripe,
  planId: SubscriptionPlanId,
  interval: BillingInterval,
): Promise<string | null> {
  const lookupKey = subscriptionLookupKey(planId, interval);
  const cached = priceIdCache.get(lookupKey);
  if (cached) return cached;

  const { data } = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const priceId = data[0]?.id ?? null;
  if (priceId) priceIdCache.set(lookupKey, priceId);
  return priceId;
}

/**
 * Formule et périodicité correspondant au prix Stripe réellement payé.
 * Source de vérité pour les changements de formule (portail client, prorata) :
 * 1. variables `STRIPE_PRICE_<PLAN>_<INTERVAL>` (anciens prix) ;
 * 2. clé fixe du prix (`lookup_key`), y compris après un changement de tarif.
 * Renvoie null pour un prix inconnu : l'appelant garde alors la formule déjà
 * connue plutôt que d'en inventer une.
 */
export async function resolvePlanFromPriceId(stripe: Stripe, priceId: string | null | undefined): Promise<PlanMatch | null> {
  if (!priceId) return null;
  const fromEnv = planFromPriceIdEnv(priceId);
  if (fromEnv) return fromEnv;

  if (planCache.has(priceId)) return planCache.get(priceId) ?? null;
  const price = await stripe.prices.retrieve(priceId);
  const match = planFromLookupKey(price.lookup_key);
  planCache.set(priceId, match);
  return match;
}

/** Prix de l'abonnement SaaS (premier élément : une formule par abonnement). */
export function subscriptionPriceId(subscription: Stripe.Subscription): string | null {
  return subscription.items?.data?.[0]?.price?.id ?? null;
}
