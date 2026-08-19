import "server-only";

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  resolveProfileIdByCustomerEmail,
  type RecordStripeBillingEventInput,
} from "@/lib/billing/stripe-billing-events";
import { syncProfileFromStripeSubscription } from "@/lib/billing/stripe-subscription-sync";
import type { BillingInterval, SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import {
  resolvePlanFromPaymentLinkUrl,
} from "@/lib/stripe/subscription-payment-links";
import { getStripe } from "@/lib/stripe/server";

function resolvePlanIdFromMetadata(metadata: Stripe.Metadata | null | undefined): SubscriptionPlanId | null {
  const plan = metadata?.plan_id?.trim();
  if (plan === "base" || plan === "pro" || plan === "premium") return plan;
  return null;
}

async function resolvePlanFromPaymentLinkSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<{ planId: SubscriptionPlanId; interval: BillingInterval } | null> {
  const paymentLinkRef = session.payment_link;
  if (!paymentLinkRef) return null;

  const paymentLinkId = typeof paymentLinkRef === "string" ? paymentLinkRef : paymentLinkRef.id;
  const paymentLink = await stripe.paymentLinks.retrieve(paymentLinkId);
  if (!paymentLink.url) return null;

  return resolvePlanFromPaymentLinkUrl(paymentLink.url);
}

export function isSaasSubscriptionCheckoutSession(session: Stripe.Checkout.Session): boolean {
  if (session.mode !== "subscription" || !session.subscription) return false;
  if (session.metadata?.checkout_kind === "saas_subscription") return true;
  return !!session.payment_link;
}

async function resolveProfileIdFromCheckoutSession(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const fromSession =
    session.metadata?.profile_id?.trim() ||
    session.client_reference_id?.trim() ||
    subscription.metadata?.profile_id?.trim();

  if (fromSession) return fromSession;

  const email = session.customer_details?.email ?? session.customer_email ?? undefined;
  return resolveProfileIdByCustomerEmail(admin, email);
}

export async function buildSaasBillingEventFromCheckoutSession(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session,
  stripeEventId: string,
  eventType: string,
): Promise<RecordStripeBillingEventInput | null> {
  if (!isSaasSubscriptionCheckoutSession(session)) return null;

  const stripe = getStripe();
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!subscriptionId) return null;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const profileId = await resolveProfileIdFromCheckoutSession(admin, session, subscription);
  const planMatch = await resolvePlanFromPaymentLinkSession(stripe, session);
  const planId =
    resolvePlanIdFromMetadata(subscription.metadata) ||
    resolvePlanIdFromMetadata(session.metadata) ||
    planMatch?.planId ||
    null;

  return {
    stripeEventId,
    eventType,
    profileId,
    checkoutSessionId: session.id,
    stripeCustomerId:
      typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
    stripeSubscriptionId: subscription.id,
    subscriptionPlan: planId,
    billingInterval: planMatch?.interval ?? null,
    amountTotalCents: session.amount_total ?? null,
    currency: session.currency ?? null,
    paymentStatus: session.payment_status ?? null,
    clientReferenceId: session.client_reference_id ?? null,
    customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
    payload: {
      mode: session.mode,
      payment_link: session.payment_link ?? null,
      subscription_status: subscription.status,
    },
  };
}

export async function syncSaasSubscriptionFromCheckoutSession(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<{ profileId: string | null; planId: SubscriptionPlanId | null }> {
  if (!isSaasSubscriptionCheckoutSession(session) || !session.subscription) {
    return { profileId: null, planId: null };
  }

  const stripe = getStripe();
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription.id;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const profileId = await resolveProfileIdFromCheckoutSession(admin, session, subscription);
  const planMatch = await resolvePlanFromPaymentLinkSession(stripe, session);
  const fallbackPlanId =
    resolvePlanIdFromMetadata(subscription.metadata) ||
    resolvePlanIdFromMetadata(session.metadata) ||
    planMatch?.planId ||
    null;

  if (!profileId) {
    console.warn("[stripe subscription] checkout sans profile_id", {
      sessionId: session.id,
      clientReferenceId: session.client_reference_id,
      customerEmail: session.customer_details?.email ?? session.customer_email,
    });
  }

  await syncProfileFromStripeSubscription(admin, subscription, profileId, {
    fallbackPlanId,
  });

  return { profileId, planId: fallbackPlanId };
}
