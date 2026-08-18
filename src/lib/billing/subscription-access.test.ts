import { describe, expect, it } from "vitest";

import {
  computeTrialEndsAt,
  evaluateSubscriptionAccess,
  TRIAL_DURATION_DAYS,
} from "@/lib/billing/subscription-access";

describe("evaluateSubscriptionAccess", () => {
  it("autorise un compte actif", () => {
    const result = evaluateSubscriptionAccess({ subscription_status: "active", account_status: "active" });
    expect(result.allowed).toBe(true);
    expect(result.status).toBe("active");
  });

  it("autorise un essai en cours", () => {
    const trialEndsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const result = evaluateSubscriptionAccess({
      subscription_status: "trialing",
      trial_ends_at: trialEndsAt,
      account_status: "active",
    });
    expect(result.allowed).toBe(true);
    expect(result.daysRemaining).toBeGreaterThan(0);
  });

  it("bloque un essai expiré", () => {
    const trialEndsAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = evaluateSubscriptionAccess({
      subscription_status: "trialing",
      trial_ends_at: trialEndsAt,
      account_status: "active",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("trial_expired");
  });

  it("bloque impayé et résilié", () => {
    expect(evaluateSubscriptionAccess({ subscription_status: "past_due" }).allowed).toBe(false);
    expect(evaluateSubscriptionAccess({ subscription_status: "canceled" }).allowed).toBe(false);
  });
});

describe("computeTrialEndsAt", () => {
  it(`ajoute ${TRIAL_DURATION_DAYS} jours`, () => {
    const from = new Date("2026-01-01T12:00:00.000Z");
    const ends = new Date(computeTrialEndsAt(from));
    expect(ends.getUTCDate()).toBe(16);
  });
});
