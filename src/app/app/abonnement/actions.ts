"use server";

import { redirect } from "next/navigation";

import type { BillingInterval, SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import { SUBSCRIPTION_PLANS } from "@/lib/billing/subscription-plans";
import { buildSubscriptionPaymentLinkUrl } from "@/lib/stripe/subscription-payment-links";
import { getPublicSiteUrl } from "@/lib/site-url";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { ok: false, error: "auth_required" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.id) {
    return { ok: false, error: "missing_profile" };
  }

  const linkResult = buildSubscriptionPaymentLinkUrl(planId, billingInterval, {
    email: user.email,
    profileId: profile.id,
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

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/reglages?tab=abonnement");

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
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
