"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { BillingInterval, SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import { SUBSCRIPTION_PLANS } from "@/lib/billing/subscription-plans";
import {
  isPromoClaimResult,
  normalizePromoCode,
  promoClaimMessage,
  shouldAttemptAmbassadorCheckout,
} from "@/lib/billing/promo-program";
import { getPromoEnrollment, reservePromoSlot } from "@/lib/billing/promo-enrollment";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createAmbassadorCheckoutSession } from "@/lib/stripe/ambassador-checkout";
import { buildSubscriptionPaymentLinkUrl } from "@/lib/stripe/subscription-payment-links";
import { getPublicSiteUrl } from "@/lib/site-url";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { requireAuthenticatedUser, resolveArtisanProfile } from "@/lib/auth/require-artisan";

export async function startSubscriptionCheckout(
  planId: SubscriptionPlanId,
  billingInterval: BillingInterval = "monthly",
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!SUBSCRIPTION_PLANS.some((plan) => plan.id === planId)) {
    return { ok: false, error: "invalid_plan" };
  }

  if (billingInterval !== "monthly" && billingInterval !== "annual") {
    return { ok: false, error: "invalid_interval" };
  }

  if (!isStripeConfigured()) {
    return { ok: false, error: "stripe_not_configured" };
  }

  const userAuth = await requireAuthenticatedUser();
  if (!userAuth.ok || !userAuth.userEmail) {
    return { ok: false, error: "auth_required" };
  }
  const { supabase, userId, userEmail } = userAuth;

  const resolvedProfile = await resolveArtisanProfile(supabase, userId, [
    "stripe_customer_id",
    "stripe_subscription_id",
    "subscription_status",
  ]);
  if (!resolvedProfile.ok) {
    return { ok: false, error: "missing_profile" };
  }

  const { profile, profileId } = resolvedProfile;
  const existingSubscriptionId = String(profile.stripe_subscription_id ?? "").trim();
  if (existingSubscriptionId && profile.subscription_status !== "canceled") {
    // Un nouveau checkout créerait un 2e abonnement (double prélèvement).
    // Les changements de formule passent par le portail Stripe.
    return { ok: false, error: "already_subscribed" };
  }

  const enrollment = await getPromoEnrollment(supabase, profileId);
  if (shouldAttemptAmbassadorCheckout(enrollment, planId)) {
    let admin;
    try {
      admin = createSupabaseAdminClient();
    } catch (e) {
      console.error("[ambassador checkout] SUPABASE_SERVICE_ROLE_KEY manquante", e);
      return { ok: false, error: "checkout_failed" };
    }

    // Place bloquée pendant le paiement ; prise définitivement au webhook.
    const reserve = await reservePromoSlot(admin, profileId);
    if (reserve === "reserved") {
      const stripeCustomerId = String(profile.stripe_customer_id ?? "").trim() || null;
      return createAmbassadorCheckoutSession({
        planId,
        interval: billingInterval,
        profileId,
        email: userEmail,
        stripeCustomerId,
        admin,
      });
    }
    // Offre close entre-temps : l'inscription passe en "lapsed", on prévient l'artisan
    // plutôt que de l'envoyer au plein tarif sans le lui dire. Le clic suivant ouvre
    // le paiement normal.
    if (reserve === "full") return { ok: false, error: "promo_full" };
    if (reserve === "expired") return { ok: false, error: "promo_expired" };
    if (reserve === null) return { ok: false, error: "checkout_failed" };
    // already_used / lapsed / not_enrolled → tarif normal.
  }

  const linkResult = buildSubscriptionPaymentLinkUrl(planId, billingInterval, {
    email: userEmail,
    profileId,
  });

  if (!linkResult.ok) {
    return { ok: false, error: linkResult.error };
  }

  return { ok: true, url: linkResult.url };
}

export async function openStripeBillingPortal(): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "stripe_not_configured" };
  }

  const userAuth = await requireAuthenticatedUser();
  if (!userAuth.ok) redirect("/login?next=/app/reglages?tab=abonnement");
  const { supabase, userId } = userAuth;

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  const customerId = profile?.stripe_customer_id?.trim();
  if (!customerId) {
    return { ok: false, error: "no_stripe_customer" };
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${getPublicSiteUrl()}/app/reglages?tab=abonnement`,
  });

  if (!session.url) {
    return { ok: false, error: "portal_failed" };
  }

  return { ok: true, url: session.url };
}

export async function claimPromoCodeAction(
  rawCode: string,
): Promise<{ ok: boolean; message: string }> {
  const code = normalizePromoCode(rawCode);
  if (!code) return { ok: false, message: promoClaimMessage("invalid") };

  const userAuth = await requireAuthenticatedUser();
  if (!userAuth.ok) return { ok: false, message: "Connectez-vous pour utiliser un code." };

  const { data, error } = await userAuth.supabase.rpc("claim_promo_code", { p_code: code });
  if (error || !isPromoClaimResult(data)) {
    console.error("[promo] claim_promo_code", error);
    return { ok: false, message: "Impossible de vérifier le code pour le moment. Réessayez." };
  }

  if (data === "registered") revalidatePath("/app/reglages");
  return { ok: data === "registered", message: promoClaimMessage(data) };
}
