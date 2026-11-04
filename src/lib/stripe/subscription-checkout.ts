import "server-only";

import type { BillingInterval, SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import { getPublicSiteUrl } from "@/lib/site-url";
import { getStripe } from "@/lib/stripe/server";
import { resolveSubscriptionPriceId } from "@/lib/stripe/subscription-prices";

/**
 * Checkout serveur au tarif normal.
 * - Avec `trialEnd` (essai gratuit) : carte obligatoire, 0 € aujourd'hui,
 *   prélèvement à `trialEnd`. L'abonnement « trialing » déclenche l'achat du
 *   numéro Soline (Pro/Premium).
 * - Sans `trialEnd` : paiement immédiat.
 *
 * Remplace les Payment Links : une session serveur garantit le retour sur
 * SolineBTP après paiement (`success_url`) et porte le profil dans ses
 * métadonnées, quel que soit le réglage des liens dans le Dashboard Stripe.
 */
export async function createSubscriptionCheckoutSession(params: {
  planId: SubscriptionPlanId;
  interval: BillingInterval;
  profileId: string;
  email: string;
  stripeCustomerId: string | null;
  trialEnd: number | null;
}): Promise<{ ok: true; url: string } | { ok: false; error: "price_not_found" | "checkout_failed" }> {
  const stripe = getStripe();
  const priceId = await resolveSubscriptionPriceId(stripe, params.planId, params.interval);
  if (!priceId) return { ok: false, error: "price_not_found" };

  const siteUrl = getPublicSiteUrl();
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      ...(params.stripeCustomerId ? { customer: params.stripeCustomerId } : { customer_email: params.email }),
      client_reference_id: params.profileId,
      // Facture B2B : nom et adresse du client obligatoires (art. 242 nonies A, annexe II CGI).
      billing_address_collection: "required",
      ...(params.trialEnd ? { payment_method_collection: "always" as const } : {}),
      locale: "fr",
      metadata: {
        checkout_kind: "saas_subscription",
        profile_id: params.profileId,
        plan_id: params.planId,
        billing_interval: params.interval,
      },
      subscription_data: {
        ...(params.trialEnd
          ? {
              trial_end: params.trialEnd,
              // Carte expirée / supprimée à la fin de l'essai : abonnement annulé, pas de facture impayée.
              trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } },
            }
          : {}),
        metadata: { profile_id: params.profileId },
      },
      success_url: `${siteUrl}/api/stripe/checkout-return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/app/reglages?tab=abonnement&canceled=1`,
    });
    if (!session.url) return { ok: false, error: "checkout_failed" };
    return { ok: true, url: session.url };
  } catch (e) {
    console.error("[subscription checkout] création session", e);
    return { ok: false, error: "checkout_failed" };
  }
}
