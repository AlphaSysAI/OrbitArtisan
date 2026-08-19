import "server-only";

import type { BillingInterval, SubscriptionPlanId } from "@/lib/billing/subscription-plans";

const PAYMENT_LINK_ENV_KEYS: Record<SubscriptionPlanId, Record<BillingInterval, string>> = {
  base: {
    monthly: "STRIPE_PAYMENT_LINK_BASE_MONTHLY",
    annual: "STRIPE_PAYMENT_LINK_BASE_ANNUAL",
  },
  pro: {
    monthly: "STRIPE_PAYMENT_LINK_PRO_MONTHLY",
    annual: "STRIPE_PAYMENT_LINK_PRO_ANNUAL",
  },
  premium: {
    monthly: "STRIPE_PAYMENT_LINK_PREMIUM_MONTHLY",
    annual: "STRIPE_PAYMENT_LINK_PREMIUM_ANNUAL",
  },
};

export function getPaymentLinkEnvKey(planId: SubscriptionPlanId, interval: BillingInterval): string {
  return PAYMENT_LINK_ENV_KEYS[planId][interval];
}

export function readPaymentLinkEnvValue(planId: SubscriptionPlanId, interval: BillingInterval): string | null {
  const key = getPaymentLinkEnvKey(planId, interval);
  const value = process.env[key]?.trim();
  return value || null;
}

export function isStripeSubscriptionPaymentLinksConfigured(): boolean {
  return (["base", "pro", "premium"] as const).every((planId) =>
    (["monthly", "annual"] as const).every((interval) => !!readPaymentLinkEnvValue(planId, interval)),
  );
}

/** Normalise une URL Payment Link (sans query ni slash final). */
export function normalizePaymentLinkUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.trim().replace(/\/$/, "");
  }
}

export function resolvePlanFromPaymentLinkUrl(
  paymentLinkUrl: string,
): { planId: SubscriptionPlanId; interval: BillingInterval } | null {
  const normalized = normalizePaymentLinkUrl(paymentLinkUrl);

  for (const planId of ["base", "pro", "premium"] as const) {
    for (const interval of ["monthly", "annual"] as const) {
      const envUrl = readPaymentLinkEnvValue(planId, interval);
      if (envUrl && normalizePaymentLinkUrl(envUrl) === normalized) {
        return { planId, interval };
      }
    }
  }

  return null;
}

export function buildSubscriptionPaymentLinkUrl(
  planId: SubscriptionPlanId,
  interval: BillingInterval,
  params: { email: string; profileId: string },
): { ok: true; url: string } | { ok: false; error: "missing_env" | "invalid_payment_link" } {
  const envKey = getPaymentLinkEnvKey(planId, interval);
  const rawUrl = readPaymentLinkEnvValue(planId, interval);
  if (!rawUrl) {
    return { ok: false, error: "missing_env" };
  }

  try {
    const url = new URL(rawUrl.trim());
    url.searchParams.set("prefilled_email", params.email);
    url.searchParams.set("client_reference_id", params.profileId);
    return { ok: true, url: url.toString() };
  } catch {
    console.error("[stripe payment link] URL invalide", { envKey, rawUrl });
    return { ok: false, error: "invalid_payment_link" };
  }
}
