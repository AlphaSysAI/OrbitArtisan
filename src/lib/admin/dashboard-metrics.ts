import { findSubscriptionPlan, type SubscriptionPlanId } from "@/lib/billing/subscription-plans";

/**
 * Calculs de l'accueil admin (module pur, testé). Une seule lecture des fiches artisan,
 * agrégée ici : chaque chiffre a une définition explicite, sans approximation cachée.
 */

export type DashboardProfileRow = {
  subscription_plan: string | null;
  subscription_status: string | null;
  account_status: string | null;
  trial_ends_at: string | null;
  created_at: string;
  onboarding_completed_at: string | null;
  voice_number_assignment_pending_at: string | null;
  /** Périodicité du dernier paiement Stripe connu (annuel → 1/12 du prix annuel). */
  billing_interval?: "monthly" | "annual" | null;
};

export type DashboardMetrics = {
  /** Abonnements payants (statut Stripe « active »), par formule. */
  paying: { total: number; byPlan: Record<SubscriptionPlanId, number> };
  trialing: number;
  /** Prix catalogue HT ramené au mois (annuel / 12), hors remises et hors dépassements. */
  mrrCents: number;
  pastDue: number;
  trialsEndingIn7Days: number;
  /** Onboarding terminé mais aucune formule souscrite : à relancer. */
  noPlanAfterOnboarding: number;
  noPlanTotal: number;
  canceled: number;
  voiceNumberPending: number;
  signups7Days: number;
  signups30Days: number;
  suspended: number;
};

const DAY = 86_400_000;

function planMonthlyCents(plan: string | null, interval: "monthly" | "annual" | null | undefined): number {
  const p = findSubscriptionPlan(plan ?? "");
  if (!p) return 0;
  return interval === "annual" ? Math.round((p.priceAnnualHtEur * 100) / 12) : Math.round(p.priceMonthlyHtEur * 100);
}

export function computeDashboardMetrics(rows: DashboardProfileRow[], now = new Date()): DashboardMetrics {
  const t = now.getTime();
  const m: DashboardMetrics = {
    paying: { total: 0, byPlan: { base: 0, pro: 0, premium: 0 } },
    trialing: 0,
    mrrCents: 0,
    pastDue: 0,
    trialsEndingIn7Days: 0,
    noPlanAfterOnboarding: 0,
    noPlanTotal: 0,
    canceled: 0,
    voiceNumberPending: 0,
    signups7Days: 0,
    signups30Days: 0,
    suspended: 0,
  };
  for (const r of rows) {
    const created = new Date(r.created_at).getTime();
    if (t - created <= 7 * DAY) m.signups7Days++;
    if (t - created <= 30 * DAY) m.signups30Days++;
    if (r.account_status === "suspended") {
      m.suspended++;
      continue; // un compte suspendu ne compte ni comme abonné ni comme tâche commerciale
    }
    if (r.voice_number_assignment_pending_at) m.voiceNumberPending++;
    switch (r.subscription_status) {
      case "active": {
        m.paying.total++;
        if (r.subscription_plan === "base" || r.subscription_plan === "pro" || r.subscription_plan === "premium") {
          m.paying.byPlan[r.subscription_plan]++;
        }
        m.mrrCents += planMonthlyCents(r.subscription_plan, r.billing_interval);
        break;
      }
      case "trialing": {
        m.trialing++;
        const end = r.trial_ends_at ? new Date(r.trial_ends_at).getTime() : null;
        if (end !== null && end >= t && end - t <= 7 * DAY) m.trialsEndingIn7Days++;
        break;
      }
      case "past_due":
        m.pastDue++;
        break;
      case "canceled":
        m.canceled++;
        break;
      case "incomplete":
        m.noPlanTotal++;
        if (r.onboarding_completed_at) m.noPlanAfterOnboarding++;
        break;
    }
  }
  return m;
}
