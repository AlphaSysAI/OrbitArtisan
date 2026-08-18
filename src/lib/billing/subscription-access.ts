/** Durée de l'essai gratuit à l'inscription (jours). */
export const TRIAL_DURATION_DAYS = 15;

/** Statuts stockés en base (alignés Stripe). */
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

export type SubscriptionAccessInput = {
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  account_status?: string | null;
  deleted_at?: string | null;
};

export type SubscriptionBlockReason = "trial_expired" | "past_due" | "canceled" | "suspended" | "no_profile";

export type SubscriptionAccessResult = {
  allowed: boolean;
  reason?: SubscriptionBlockReason;
  status: SubscriptionStatus | "unknown";
  trialEndsAt: Date | null;
  daysRemaining: number | null;
};

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trialing: "Essai",
  active: "Actif",
  past_due: "Impayé",
  canceled: "Résilié",
};

export function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return value === "trialing" || value === "active" || value === "past_due" || value === "canceled";
}

export function computeTrialEndsAt(from = new Date()): string {
  const ends = new Date(from);
  ends.setUTCDate(ends.getUTCDate() + TRIAL_DURATION_DAYS);
  return ends.toISOString();
}

export function evaluateSubscriptionAccess(profile: SubscriptionAccessInput | null | undefined): SubscriptionAccessResult {
  if (!profile) {
    return { allowed: false, reason: "no_profile", status: "unknown", trialEndsAt: null, daysRemaining: null };
  }

  if (profile.deleted_at || profile.account_status === "suspended") {
    return { allowed: false, reason: "suspended", status: "unknown", trialEndsAt: null, daysRemaining: null };
  }

  const rawStatus = profile.subscription_status ?? "trialing";
  const status = isSubscriptionStatus(rawStatus) ? rawStatus : "unknown";
  const trialEndsAt = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;

  if (status === "active") {
    return { allowed: true, status, trialEndsAt, daysRemaining: null };
  }

  if (status === "trialing") {
    if (!trialEndsAt || Date.now() > trialEndsAt.getTime()) {
      return {
        allowed: false,
        reason: "trial_expired",
        status,
        trialEndsAt,
        daysRemaining: 0,
      };
    }
    const daysRemaining = Math.max(
      0,
      Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    );
    return { allowed: true, status, trialEndsAt, daysRemaining };
  }

  if (status === "past_due") {
    return { allowed: false, reason: "past_due", status, trialEndsAt, daysRemaining: null };
  }

  if (status === "canceled") {
    return { allowed: false, reason: "canceled", status, trialEndsAt, daysRemaining: null };
  }

  return { allowed: false, reason: "canceled", status, trialEndsAt, daysRemaining: null };
}

/** Chemins où la création de devis est bloquée si l'abonnement ne le permet pas. */
export const SUBSCRIPTION_DOCUMENT_BLOCKED_PATHS = ["/app/quotes/new"] as const;

export function isSubscriptionDocumentBlockedPath(pathname: string): boolean {
  return SUBSCRIPTION_DOCUMENT_BLOCKED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function subscriptionBlockRedirectReason(reason: SubscriptionBlockReason): string {
  switch (reason) {
    case "trial_expired":
      return "trial_expired";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    default:
      return "subscription";
  }
}
