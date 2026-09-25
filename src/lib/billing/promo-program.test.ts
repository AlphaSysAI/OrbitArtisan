import { describe, expect, it } from "vitest";

import { AMBASSADOR_PROGRAM, normalizePromoCode, shouldAttemptAmbassadorCheckout } from "./promo-program";

describe("normalizePromoCode", () => {
  it("met en majuscules et retire les espaces", () => {
    expect(normalizePromoCode("  ambassa deur ")).toBe("AMBASSADEUR");
  });
  it("rejette les saisies invalides", () => {
    expect(normalizePromoCode("")).toBeNull();
    expect(normalizePromoCode("ab")).toBeNull();
    expect(normalizePromoCode("code;drop")).toBeNull();
    expect(normalizePromoCode(42)).toBeNull();
  });
});

describe("shouldAttemptAmbassadorCheckout", () => {
  const registered = { programCode: AMBASSADOR_PROGRAM.code, status: "registered" as const };

  it("tente la remise sur Pro et Premium avec un code enregistré ou un paiement en cours", () => {
    expect(shouldAttemptAmbassadorCheckout(registered, "pro")).toBe(true);
    expect(shouldAttemptAmbassadorCheckout(registered, "premium")).toBe(true);
    expect(shouldAttemptAmbassadorCheckout({ ...registered, status: "pending" }, "pro")).toBe(true);
  });
  it("jamais sur Base", () => {
    expect(shouldAttemptAmbassadorCheckout(registered, "base")).toBe(false);
  });
  it("pas si la remise est consommée, perdue ou l'offre close", () => {
    expect(shouldAttemptAmbassadorCheckout({ ...registered, status: "active" }, "pro")).toBe(false);
    expect(shouldAttemptAmbassadorCheckout({ ...registered, status: "forfeited" }, "pro")).toBe(false);
    expect(shouldAttemptAmbassadorCheckout({ ...registered, status: "lapsed" }, "pro")).toBe(false);
    expect(shouldAttemptAmbassadorCheckout(null, "pro")).toBe(false);
  });
});
