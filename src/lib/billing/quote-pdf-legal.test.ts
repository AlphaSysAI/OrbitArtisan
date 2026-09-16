import { describe, expect, it } from "vitest";

import { validateQuoteLegalProfile } from "@/lib/billing/quote-pdf-legal";

describe("validateQuoteLegalProfile", () => {
  it("bloque si SIRET et adresse manquants", () => {
    const res = validateQuoteLegalProfile({
      business_name: "Dupont BTP",
      siren: null,
      siret: null,
      addressLine1: null,
      postalCode: null,
      city: null,
    });
    expect(res.ok).toBe(false);
    expect(res.blocking.length).toBeGreaterThan(0);
  });

  it("bloque si l'assurance décennale est absente, même avec le reste du profil complet", () => {
    const res = validateQuoteLegalProfile({
      business_name: "Dupont BTP",
      siret: "12345678901234",
      addressLine1: "1 rue Test",
      postalCode: "75001",
      city: "Paris",
      decennale_insurer: null,
      decennale_policy_number: null,
    });
    expect(res.ok).toBe(false);
    expect(res.blocking.some((m) => m.toLowerCase().includes("décennale"))).toBe(true);
  });

  it("accepte un profil complet (dont décennale) avec avertissements résiduels", () => {
    const res = validateQuoteLegalProfile({
      business_name: "Dupont BTP",
      siret: "12345678901234",
      addressLine1: "1 rue Test",
      postalCode: "75001",
      city: "Paris",
      decennale_insurer: "AXA",
      decennale_policy_number: "DEC-123",
    });
    expect(res.ok).toBe(true);
    // RC Pro, médiateur, TVA intra restent de simples avertissements.
    expect(res.warnings.length).toBeGreaterThan(0);
  });
});
