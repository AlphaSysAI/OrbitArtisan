import "server-only";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  evaluateSubscriptionAccess,
  subscriptionBlockRedirectReason,
  type SubscriptionBlockReason,
} from "@/lib/billing/subscription-access";

const PROFILE_SUBSCRIPTION_SELECT =
  "subscription_status, trial_ends_at, account_status, deleted_at";

export async function loadArtisanSubscriptionAccess(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select(PROFILE_SUBSCRIPTION_SELECT)
    .eq("user_id", userId)
    .maybeSingle();

  return evaluateSubscriptionAccess(profile ?? null);
}

export async function assertCanCreateDocuments(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: true } | { ok: false; reason: SubscriptionBlockReason }> {
  const access = await loadArtisanSubscriptionAccess(supabase, userId);
  if (access.allowed) return { ok: true };
  return { ok: false, reason: access.reason ?? "trial_expired" };
}

export async function redirectIfCannotCreateDocuments(supabase: SupabaseClient, userId: string): Promise<void> {
  const access = await loadArtisanSubscriptionAccess(supabase, userId);
  if (access.allowed) return;

  const reason = subscriptionBlockRedirectReason(access.reason ?? "trial_expired");
  redirect(`/app/abonnement?reason=${reason}`);
}
