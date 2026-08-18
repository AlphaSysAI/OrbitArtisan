import "server-only";

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getPlanVoiceMinutes, type SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import type { SubscriptionStatus } from "@/lib/billing/subscription-access";

export function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;
  if (!subscriptionRef) return null;
  return typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef.id;
}

function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "canceled";
    default:
      return "past_due";
  }
}

function resolvePlanId(metadata: Stripe.Metadata | null | undefined): SubscriptionPlanId | null {
  const plan = metadata?.plan_id?.trim();
  if (plan === "base" || plan === "pro" || plan === "premium") return plan;
  return null;
}

export async function syncProfileFromStripeSubscription(
  admin: SupabaseClient,
  subscription: Stripe.Subscription,
  fallbackProfileId?: string | null,
) {
  const profileId = subscription.metadata?.profile_id?.trim() || fallbackProfileId?.trim();
  if (!profileId) {
    console.warn("[stripe subscription] profile_id manquant", subscription.id);
    return;
  }

  const planId = resolvePlanId(subscription.metadata);
  const status = mapStripeSubscriptionStatus(subscription.status);
  const trialEndsAt =
    subscription.trial_end != null ? new Date(subscription.trial_end * 1000).toISOString() : null;

  const payload: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    stripe_customer_id:
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null,
    subscription_status: status,
    updated_at: new Date().toISOString(),
  };

  if (planId) {
    payload.subscription_plan = planId;
    payload.voice_minutes_included = getPlanVoiceMinutes(planId);
  }

  if (status === "trialing" && trialEndsAt) {
    payload.trial_ends_at = trialEndsAt;
  }

  if (status === "active") {
    payload.trial_ends_at = null;
  }

  const { error } = await admin.from("profiles").update(payload).eq("id", profileId);
  if (error) {
    console.error("[stripe subscription] sync profile", { profileId, error });
  }
}

export async function markProfileSubscriptionPastDue(admin: SupabaseClient, subscription: Stripe.Subscription) {
  const profileId = subscription.metadata?.profile_id?.trim();
  if (!profileId) return;

  await admin
    .from("profiles")
    .update({
      subscription_status: "past_due",
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);
}

export async function markProfileSubscriptionCanceled(admin: SupabaseClient, subscription: Stripe.Subscription) {
  const profileId = subscription.metadata?.profile_id?.trim();
  if (!profileId) return;

  await admin
    .from("profiles")
    .update({
      subscription_status: "canceled",
      stripe_subscription_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);
}
