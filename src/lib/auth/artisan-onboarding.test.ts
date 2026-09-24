import { describe, expect, it } from "vitest";

import {
  artisanNeedsOnboarding,
  isOnboardingContactStepComplete,
  isOnboardingLegalStepComplete,
  resolveOnboardingStep,
} from "@/lib/auth/artisan-onboarding";

const fullContact = {
  name: "Jean Dupont",
  business_name: "Dupont Plomberie",
  phone: "0612345678",
  address_line1: "12 rue Test",
  postal_code: "75001",
  city: "Paris",
};

const fullLegal = {
  siren: "732829320",
  siret: "73282932000074",
  vat_number: "FR44732829320",
  trade_register_number: "RCS Paris B 732 829 320",
  decennale_insurer: "AXA",
  decennale_policy_number: "DEC-123",
  rc_pro_insurer: "MAIF",
  rc_pro_number: "RC-456",
  mediator_name: "Médiateur FEVAD",
  mediator_url: "https://www.mediateurfevad.fr",
  default_payment_terms_days: 30,
};

describe("artisan onboarding", () => {
  it("needs onboarding when completed_at is null", () => {
    expect(artisanNeedsOnboarding({ onboarding_completed_at: null })).toBe(true);
    expect(artisanNeedsOnboarding({ onboarding_completed_at: "2026-01-01T00:00:00Z" })).toBe(false);
  });

  it("resolves step from profile completeness", () => {
    expect(resolveOnboardingStep({})).toBe(1);
    expect(resolveOnboardingStep(fullContact)).toBe(2);
  });

  it("validates contact step", () => {
    expect(isOnboardingContactStepComplete(fullContact)).toBe(true);
    expect(isOnboardingContactStepComplete({ ...fullContact, phone: "12" })).toBe(false);
  });

  it("validates legal step", () => {
    expect(isOnboardingLegalStepComplete(fullLegal)).toBe(true);
    expect(isOnboardingLegalStepComplete({ ...fullLegal, mediator_url: "ftp://bad" })).toBe(false);
  });
});
