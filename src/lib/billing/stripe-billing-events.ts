import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BillingInterval, SubscriptionPlanId } from "@/lib/billing/subscription-plans";

export type StripeBillingEventRow = {
  id: string;
  profile_id: string | null;
  stripe_event_id: string;
  event_type: string;
  checkout_session_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_plan: string | null;
  billing_interval: string | null;
  amount_total_cents: number | null;
  currency: string | null;
  payment_status: string | null;
  client_reference_id: string | null;
  customer_email: string | null;
  created_at: string;
};

export type RecordStripeBillingEventInput = {
  stripeEventId: string;
  eventType: string;
  profileId?: string | null;
  checkoutSessionId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  subscriptionPlan?: SubscriptionPlanId | null;
  billingInterval?: BillingInterval | null;
  amountTotalCents?: number | null;
  currency?: string | null;
  paymentStatus?: string | null;
  clientReferenceId?: string | null;
  customerEmail?: string | null;
  payload?: Record<string, unknown>;
};

export async function recordStripeBillingEvent(
  admin: SupabaseClient,
  input: RecordStripeBillingEventInput,
): Promise<void> {
  const { error } = await admin.from("stripe_billing_events").upsert(
    {
      stripe_event_id: input.stripeEventId,
      event_type: input.eventType,
      profile_id: input.profileId ?? null,
      checkout_session_id: input.checkoutSessionId ?? null,
      stripe_customer_id: input.stripeCustomerId ?? null,
      stripe_subscription_id: input.stripeSubscriptionId ?? null,
      subscription_plan: input.subscriptionPlan ?? null,
      billing_interval: input.billingInterval ?? null,
      amount_total_cents: input.amountTotalCents ?? null,
      currency: input.currency ?? null,
      payment_status: input.paymentStatus ?? null,
      client_reference_id: input.clientReferenceId ?? null,
      customer_email: input.customerEmail ?? null,
      payload: input.payload ?? {},
    },
    { onConflict: "stripe_event_id", ignoreDuplicates: true },
  );

  if (error) {
    console.error("[stripe billing events] insert failed", {
      stripeEventId: input.stripeEventId,
      eventType: input.eventType,
      error,
    });
  }
}

export async function listStripeBillingEventsForProfile(
  supabase: SupabaseClient,
  profileId: string,
  limit = 10,
): Promise<StripeBillingEventRow[]> {
  const { data, error } = await supabase
    .from("stripe_billing_events")
    .select(
      "id, profile_id, stripe_event_id, event_type, checkout_session_id, stripe_customer_id, stripe_subscription_id, subscription_plan, billing_interval, amount_total_cents, currency, payment_status, client_reference_id, customer_email, created_at",
    )
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[stripe billing events] list failed", { profileId, error });
    return [];
  }

  return (data ?? []) as StripeBillingEventRow[];
}

export async function resolveProfileIdByCustomerEmail(
  admin: SupabaseClient,
  email: string | null | undefined,
): Promise<string | null> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;

  const authAdmin = admin.auth.admin as {
    getUserByEmail?: (email: string) => Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };

  if (typeof authAdmin.getUserByEmail === "function") {
    const { data, error } = await authAdmin.getUserByEmail(normalized);
    if (!error && data.user?.id) {
      const { data: profile } = await admin
        .from("profiles")
        .select("id")
        .eq("user_id", data.user.id)
        .maybeSingle();
      return profile?.id ?? null;
    }
  }

  return null;
}
