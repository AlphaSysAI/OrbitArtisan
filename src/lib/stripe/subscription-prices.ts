import "server-only";

import type Stripe from "stripe";

import type { BillingInterval, SubscriptionPlanId } from "@/lib/billing/subscription-plans";
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
