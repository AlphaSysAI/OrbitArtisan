import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { attachPromoCheckoutSession } from "@/lib/billing/promo-enrollment";
import { AMBASSADOR_PROGRAM } from "@/lib/billing/promo-program";
import type { BillingInterval, SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import { getPublicSiteUrl } from "@/lib/site-url";
import { getStripe } from "@/lib/stripe/server";
import { MANAGED_PAYMENTS, MANAGED_PAYMENTS_REQUEST } from "@/lib/stripe/managed-payments";
import { resolveSubscriptionPriceId } from "@/lib/stripe/subscription-prices";
import { subscriptionCheckoutBranding } from "@/lib/stripe/checkout-branding";

/**
 * Coupon Stripe −25 % à vie, limité aux produits Pro et Premium : la remise
 * tombe d'elle-même en cas de passage en Essentiel ou Ultra via le portail.
 */
const AMBASSADOR_COUPON_ID = "AMB25PP";

type AmbassadorCheckoutError = "promo_not_configured" | "price_not_found" | "checkout_failed";

/**
 * Checkout Session serveur avec le coupon ambassadeur.
 *
 * Coupon `AMB25PP` (voir AMBASSADOR_COUPON_ID) : la remise suit un passage
 * Pro ↔ Premium via le portail.
 *
 * Aucun code promo n'est saisissable côté Stripe : l'éligibilité est décidée ici.
 * Préalable : la place doit avoir été bloquée (reserve_promo_slot). La session
 * expire au bout de 30 min, avant la fin du blocage (35 min).
 */
export async function createAmbassadorCheckoutSession(params: {
  planId: SubscriptionPlanId;
  interval: BillingInterval;
  profileId: string;
  email: string;
  stripeCustomerId: string | null;
  admin: SupabaseClient;
  /** Choix de formule pendant l'essai : carte enregistrée, prélèvement à cette date (unix). */
  trialEnd?: number | null;
}): Promise<{ ok: true; url: string } | { ok: false; error: AmbassadorCheckoutError }> {
  const couponId = AMBASSADOR_COUPON_ID;

  const stripe = getStripe();
  const priceId = await resolveSubscriptionPriceId(stripe, params.planId, params.interval);
  if (!priceId) {
    console.error("[ambassador checkout] price introuvable", { planId: params.planId, interval: params.interval });
    return { ok: false, error: "price_not_found" };
  }

  const siteUrl = getPublicSiteUrl();
  const metadata = {
    checkout_kind: "saas_subscription",
    profile_id: params.profileId,
    plan_id: params.planId,
    billing_interval: params.interval,
    promo_code: AMBASSADOR_PROGRAM.code,
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      // Stripe marchand officiel (Managed Payments) : TVA calculée et collectée par
      // Stripe, comme sur les anciens Payment Links. Incompatible avec automatic_tax.
      ...MANAGED_PAYMENTS,
      ...subscriptionCheckoutBranding(),
      line_items: [{ price: priceId, quantity: 1 }],
      discounts: [{ coupon: couponId }],
      ...(params.stripeCustomerId
        ? { customer: params.stripeCustomerId }
        : { customer_email: params.email }),
      client_reference_id: params.profileId,
      // Facture B2B : nom et adresse du client obligatoires (art. 242 nonies A, annexe II CGI).
      billing_address_collection: "required",
      locale: "fr",
      expires_at: Math.floor(Date.now() / 1000) + AMBASSADOR_PROGRAM.checkoutSessionMinutes * 60,
      metadata,
      ...(params.trialEnd ? { payment_method_collection: "always" as const } : {}),
      subscription_data: {
        ...(params.trialEnd
          ? { trial_end: params.trialEnd, trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } } }
          : {}),
        // Pas de plan_id ici : il deviendrait faux après un changement de formule via le portail.
        metadata: { profile_id: params.profileId, promo_code: AMBASSADOR_PROGRAM.code },
      },
      success_url: `${siteUrl}/api/stripe/checkout-return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/app/reglages?tab=abonnement&canceled=1`,
    }, MANAGED_PAYMENTS_REQUEST);

    if (!session.url) return { ok: false, error: "checkout_failed" };
    await attachPromoCheckoutSession(params.admin, params.profileId, session.id);
    return { ok: true, url: session.url };
  } catch (e) {
    console.error("[ambassador checkout] création session", e);
    return { ok: false, error: "checkout_failed" };
  }
}
