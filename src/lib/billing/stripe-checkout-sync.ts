import "server-only";

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { syncProfileFromStripeSubscription } from "@/lib/billing/stripe-subscription-sync";
import { resolvePlanFromPaymentLinkUrl } from "@/lib/stripe/subscription-payment-links";
import { getStripe } from "@/lib/stripe/server";

function resolvePlanIdFromMetadata(metadata: Stripe.Metadata | null | undefined) {
  const plan = metadata?.plan_id?.trim();
  if (plan === "base" || plan === "pro" || plan === "premium") return plan;
  return null;
}

async function resolvePlanIdFromPaymentLinkSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) {
  const fromSession = resolvePlanIdFromMetadata(session.metadata);
  if (fromSession) return fromSession;

  const paymentLinkRef = session.payment_link;
  if (!paymentLinkRef) return null;

  const paymentLinkId = typeof paymentLinkRef === "string" ? paymentLinkRef : paymentLinkRef.id;
  const paymentLink = await stripe.paymentLinks.retrieve(paymentLinkId);
  if (!paymentLink.url) return null;

  return resolvePlanFromPaymentLinkUrl(paymentLink.url)?.planId ?? null;
}

export function isSaasSubscriptionCheckoutSession(session: Stripe.Checkout.Session): boolean {
  if (session.mode !== "subscription" || !session.subscription) return false;
  if (session.metadata?.checkout_kind === "saas_subscription") return true;
  return !!session.payment_link;
}

export async function syncSaasSubscriptionFromCheckoutSession(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session,
) {
  if (!isSaasSubscriptionCheckoutSession(session) || !session.subscription) return;

  const stripe = getStripe();
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription.id;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const profileId =
    session.metadata?.profile_id?.trim() ||
    session.client_reference_id?.trim() ||
    subscription.metadata?.profile_id?.trim();

  const fallbackPlanId = await resolvePlanIdFromPaymentLinkSession(stripe, session);

  await syncProfileFromStripeSubscription(admin, subscription, profileId, {
    fallbackPlanId,
  });
}
