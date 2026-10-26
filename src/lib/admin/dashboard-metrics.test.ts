import { describe, expect, it } from "vitest";

import { computeDashboardMetrics, type DashboardProfileRow } from "./dashboard-metrics";

const NOW = new Date("2026-10-26T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

const row = (over: Partial<DashboardProfileRow>): DashboardProfileRow => ({
  subscription_plan: "pro",
  subscription_status: "incomplete",
  account_status: "active",
  trial_ends_at: null,
  created_at: daysAgo(60),
  onboarding_completed_at: null,
  voice_number_assignment_pending_at: null,
  ...over,
});

describe("accueil admin", () => {
  it("un compte sans formule n'est jamais compté comme abonné ni dans le MRR (même avec plan « pro » par défaut)", () => {
    const m = computeDashboardMetrics([row({}), row({ onboarding_completed_at: daysAgo(1) })], NOW);
    expect(m.paying.total).toBe(0);
    expect(m.mrrCents).toBe(0);
    expect(m.noPlanTotal).toBe(2);
    expect(m.noPlanAfterOnboarding).toBe(1);
  });

  it("MRR : prix mensuel, ou annuel / 12 selon le dernier paiement ; essais et impayés exclus", () => {
    const m = computeDashboardMetrics(
      [
        row({ subscription_status: "active", subscription_plan: "pro" }),
        row({ subscription_status: "active", subscription_plan: "premium", billing_interval: "annual" }),
        row({ subscription_status: "trialing", subscription_plan: "premium", trial_ends_at: inDays(20) }),
        row({ subscription_status: "past_due", subscription_plan: "pro" }),
      ],
      NOW,
    );
    expect(m.paying).toEqual({ total: 2, byPlan: { base: 0, pro: 1, premium: 1 } });
    expect(m.mrrCents).toBe(9900 + Math.round(149000 / 12));
    expect(m.trialing).toBe(1);
    expect(m.pastDue).toBe(1);
  });

  it("essais qui se terminent sous 7 jours (pas ceux déjà terminés)", () => {
    const m = computeDashboardMetrics(
      [
        row({ subscription_status: "trialing", trial_ends_at: inDays(3) }),
        row({ subscription_status: "trialing", trial_ends_at: inDays(10) }),
        row({ subscription_status: "trialing", trial_ends_at: daysAgo(1) }),
      ],
      NOW,
    );
    expect(m.trialsEndingIn7Days).toBe(1);
  });

  it("compte suspendu : compté à part, hors abonnés et hors tâches", () => {
    const m = computeDashboardMetrics([row({ account_status: "suspended", subscription_status: "active", voice_number_assignment_pending_at: daysAgo(1) })], NOW);
    expect(m.suspended).toBe(1);
    expect(m.paying.total).toBe(0);
    expect(m.voiceNumberPending).toBe(0);
  });

  it("inscriptions sur 7 et 30 jours", () => {
    const m = computeDashboardMetrics([row({ created_at: daysAgo(2) }), row({ created_at: daysAgo(20) }), row({ created_at: daysAgo(40) })], NOW);
    expect(m.signups7Days).toBe(1);
    expect(m.signups30Days).toBe(2);
  });
});
