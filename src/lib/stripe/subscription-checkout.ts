import "server-only";

import type { BillingInterval, SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import { getPublicSiteUrl } from "@/lib/site-url";
import { getStripe } from "@/lib/stripe/server";
import { resolveSubscriptionPriceId } from "@/lib/stripe/subscription-prices";

/**
 * Checkout serveur au tarif normal, utilisé pendant l'essai gratuit : carte
 * obligatoire, 0 € aujourd'hui, prélèvement à `trialEnd`. (Hors essai, les
 * Payment Links restent utilisés.) L'abonnement Stripe « trialing » déclenche
 * l'achat du numéro Soline (Pro/Premium).
 */
export async function createTrialSubscriptionCheckoutSession(params: {
  planId: SubscriptionPlanId;
  interval: BillingInterval;
  profileId: string;
  email: string;
  stripeCustomerId: string | null;
  trialEnd: number;
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
      payment_method_collection: "always",
      locale: "fr",
      metadata: {
        checkout_kind: "saas_subscription",
        profile_id: params.profileId,
        plan_id: params.planId,
        billing_interval: params.interval,
      },
      subscription_data: {
        trial_end: params.trialEnd,
        // Carte expirée / supprimée à la fin de l'essai : abonnement annulé, pas de facture impayée.
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
        metadata: { profile_id: params.profileId },
      },
      success_url: `${siteUrl}/app/reglages?tab=abonnement&success=1`,
      cancel_url: `${siteUrl}/app/reglages?tab=abonnement&canceled=1`,
    });
    if (!session.url) return { ok: false, error: "checkout_failed" };
    return { ok: true, url: session.url };
  } catch (e) {
    console.error("[trial checkout] création session", e);
    return { ok: false, error: "checkout_failed" };
  }
}
