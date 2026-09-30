import { describe, expect, it } from "vitest";

import { frenchVatFromSiren, isConsistentFrenchVat, isValidSiren, isValidSiret } from "./identifiers";

describe("identifiants entreprise", () => {
  it("SIREN / SIRET (clé de Luhn)", () => {
    expect(isValidSiren("732 829 320")).toBe(true);
    expect(isValidSiren("732829321")).toBe(false);
    expect(isValidSiret("73282932000074")).toBe(true);
    expect(isValidSiret("73282932000075")).toBe(false);
    expect(isValidSiret("7328293200007")).toBe(false);
  });
  it("TVA FR calculée depuis le SIREN", () => {
    expect(frenchVatFromSiren("732829320")).toBe("FR44732829320");
    expect(isConsistentFrenchVat("FR 44 732829320", "732829320")).toBe(true);
    expect(isConsistentFrenchVat("FR45732829320", "732829320")).toBe(false);
  });
});
