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

  it("accepte un profil minimal valide avec avertissements", () => {
    const res = validateQuoteLegalProfile({
      business_name: "Dupont BTP",
      siret: "12345678901234",
      addressLine1: "1 rue Test",
      postalCode: "75001",
      city: "Paris",
    });
    expect(res.ok).toBe(true);
    expect(res.warnings.length).toBeGreaterThan(0);
  });
});
