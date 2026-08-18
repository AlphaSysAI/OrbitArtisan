"use server";

import { redirect } from "next/navigation";

import type { SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import { SUBSCRIPTION_PLANS } from "@/lib/billing/subscription-plans";
import { getPublicSiteUrl } from "@/lib/site-url";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function startSubscriptionCheckout(
  planId: SubscriptionPlanId,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!SUBSCRIPTION_PLANS.some((plan) => plan.id === planId)) {
    return { ok: false, error: "invalid_plan" };
  }

  if (!isStripeConfigured()) {
    return { ok: false, error: "stripe_not_configured" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login?next=/app/abonnement");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, stripe_customer_id, business_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.id) {
    return { ok: false, error: "missing_profile" };
  }

  const plan = SUBSCRIPTION_PLANS.find((item) => item.id === planId)!;
  const stripe = getStripe();
  const siteUrl = getPublicSiteUrl();

  let customerId = profile.stripe_customer_id?.trim() || null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: profile.business_name ?? undefined,
      metadata: { profile_id: profile.id, user_id: user.id },
    });
    customerId = customer.id;
    await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", profile.id);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: `Soline — ${plan.name}`,
            description: plan.description,
          },
          unit_amount: plan.priceHtEur * 100,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    subscription_data: {
      metadata: {
        profile_id: profile.id,
        plan_id: planId,
        user_id: user.id,
      },
    },
    metadata: {
      profile_id: profile.id,
      plan_id: planId,
      checkout_kind: "saas_subscription",
    },
    success_url: `${siteUrl}/app/abonnement?success=1`,
    cancel_url: `${siteUrl}/app/abonnement?canceled=1`,
  });

  if (!session.url) {
    return { ok: false, error: "checkout_failed" };
  }

  return { ok: true, url: session.url };
}
