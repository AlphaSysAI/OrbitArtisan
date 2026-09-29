import "server-only";

import type Stripe from "stripe";

import type { BillingInterval, SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import { planFromPriceIdEnv, type PlanMatch } from "@/lib/stripe/price-plan-map";
import {
  normalizePaymentLinkUrl,
  readPaymentLinkEnvValue,
} from "@/lib/stripe/subscription-payment-links";

/**
 * Résout le Price Stripe d'une formule, pour les Checkout Sessions créées côté
 * serveur (tarif ambassadeur).
 *
 * 1. `STRIPE_PRICE_<PLAN>_<INTERVAL>` si défini (recommandé en production) ;
 * 2. sinon, déduit du Payment Link déjà configuré (source de vérité actuelle),
 *    pour ne pas dupliquer la grille dans deux endroits.
 */
const cache = new Map<string, string>();

function envPriceKey(planId: SubscriptionPlanId, interval: BillingInterval): string {
  return `STRIPE_PRICE_${planId.toUpperCase()}_${interval.toUpperCase()}`;
}

export async function resolveSubscriptionPriceId(
  stripe: Stripe,
  planId: SubscriptionPlanId,
  interval: BillingInterval,
): Promise<string | null> {
  const fromEnv = process.env[envPriceKey(planId, interval)]?.trim();
  if (fromEnv) return fromEnv;

  const cacheKey = `${planId}:${interval}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const linkUrl = readPaymentLinkEnvValue(planId, interval);
  if (!linkUrl) return null;
  const target = normalizePaymentLinkUrl(linkUrl);

  for await (const link of stripe.paymentLinks.list({ active: true, limit: 100 })) {
    if (!link.url || normalizePaymentLinkUrl(link.url) !== target) continue;

    const items = await stripe.paymentLinks.listLineItems(link.id, { limit: 1 });
    const priceId = items.data[0]?.price?.id ?? null;
    if (priceId) cache.set(cacheKey, priceId);
    return priceId;
  }

  return null;
}

const PLANS: SubscriptionPlanId[] = ["base", "pro", "premium"];
const INTERVALS: BillingInterval[] = ["monthly", "annual"];

/**
 * Formule et périodicité correspondant au prix Stripe réellement payé.
 * Source de vérité pour les changements de formule (portail client, prorata) :
 * 1. variables `STRIPE_PRICE_<PLAN>_<INTERVAL>` ;
 * 2. à défaut, prix déduits des Payment Links configurés (mis en cache).
 * Renvoie null pour un prix inconnu (ex. ancienne grille) : l'appelant garde alors la
 * formule déjà connue plutôt que d'en inventer une.
 */
export async function resolvePlanFromPriceId(stripe: Stripe, priceId: string | null | undefined): Promise<PlanMatch | null> {
  if (!priceId) return null;
  const fromEnv = planFromPriceIdEnv(priceId);
  if (fromEnv) return fromEnv;

  for (const planId of PLANS) {
    for (const interval of INTERVALS) {
      if (process.env[envPriceKey(planId, interval)]?.trim()) continue; // déjà comparé via l'env
      const resolved = await resolveSubscriptionPriceId(stripe, planId, interval).catch(() => null);
      if (resolved === priceId) return { planId, interval };
    }
  }
  return null;
}

/** Prix de l'abonnement SaaS (premier élément : une formule par abonnement). */
export function subscriptionPriceId(subscription: Stripe.Subscription): string | null {
  return subscription.items?.data?.[0]?.price?.id ?? null;
}
