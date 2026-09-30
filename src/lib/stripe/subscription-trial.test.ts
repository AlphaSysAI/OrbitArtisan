import { describe, expect, it } from "vitest";

import { TRIAL_DURATION_DAYS } from "@/lib/billing/subscription-access";

import { stripeTrialEndFromProfile } from "./subscription-trial";

const now = Date.parse("2026-10-01T10:00:00Z");

describe("stripeTrialEndFromProfile", () => {
  it("compte jamais abonné : essai complet", () => {
    expect(stripeTrialEndFromProfile({ subscription_status: "incomplete", trial_ends_at: null }, now)).toBe(
      Math.floor((now + TRIAL_DURATION_DAYS * 86_400_000) / 1000),
    );
  });
  it("reprend la fin d'essai prévue", () => {
    expect(stripeTrialEndFromProfile({ subscription_status: "trialing", trial_ends_at: "2026-10-10T10:00:00Z" }, now)).toBe(
      Date.parse("2026-10-10T10:00:00Z") / 1000,
    );
  });
  it("pas d'essai Stripe à moins de 48 h de la fin, ni hors essai", () => {
    expect(stripeTrialEndFromProfile({ subscription_status: "trialing", trial_ends_at: "2026-10-03T09:00:00Z" }, now)).toBeNull();
    expect(stripeTrialEndFromProfile({ subscription_status: "canceled", trial_ends_at: "2026-10-10T10:00:00Z" }, now)).toBeNull();
    expect(stripeTrialEndFromProfile({ subscription_status: "trialing", trial_ends_at: null }, now)).toBeNull();
  });
});
