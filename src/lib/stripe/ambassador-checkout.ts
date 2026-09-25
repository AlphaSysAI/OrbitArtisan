import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { attachPromoCheckoutSession } from "@/lib/billing/promo-enrollment";
import { AMBASSADOR_PROGRAM } from "@/lib/billing/promo-program";
import type { BillingInterval, SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import { getPublicSiteUrl } from "@/lib/site-url";
import { getStripe } from "@/lib/stripe/server";
import { resolveSubscriptionPriceId } from "@/lib/stripe/subscription-prices";

export type AmbassadorCheckoutError = "promo_not_configured" | "price_not_found" | "checkout_failed";

/**
 * Checkout Session serveur avec le coupon ambassadeur.
 *
 * Le coupon (`STRIPE_AMBASSADOR_COUPON_ID`) doit être créé dans Stripe en
 * `percent_off: 25`, `duration: forever`, restreint (`applies_to.products`) aux
 * produits Pro et Premium : la remise suit un passage Pro ↔ Premium via le
 * portail, et tombe d'elle-même en cas de passage en Base.
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
}): Promise<{ ok: true; url: string } | { ok: false; error: AmbassadorCheckoutError }> {
  const couponId = process.env.STRIPE_AMBASSADOR_COUPON_ID?.trim();
  if (!couponId) {
    // Ne jamais basculer silencieusement au plein tarif : l'artisan a une place réservée.
    console.error("[ambassador checkout] STRIPE_AMBASSADOR_COUPON_ID manquant");
    return { ok: false, error: "promo_not_configured" };
  }

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
      subscription_data: {
        // Pas de plan_id ici : il deviendrait faux après un changement de formule via le portail.
        metadata: { profile_id: params.profileId, promo_code: AMBASSADOR_PROGRAM.code },
      },
      success_url: `${siteUrl}/app/reglages?tab=abonnement&success=1`,
      cancel_url: `${siteUrl}/app/reglages?tab=abonnement&canceled=1`,
    });

    if (!session.url) return { ok: false, error: "checkout_failed" };
    await attachPromoCheckoutSession(params.admin, params.profileId, session.id);
    return { ok: true, url: session.url };
  } catch (e) {
    console.error("[ambassador checkout] création session", e);
    return { ok: false, error: "checkout_failed" };
  }
}
