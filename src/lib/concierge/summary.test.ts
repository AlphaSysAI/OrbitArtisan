import { describe, expect, it } from "vitest";

import { buildAnonymizedSummary, communeFromAddress, scrubPii } from "./summary";

describe("récap anonymisé", () => {
  it("masque e-mail, téléphone et rue", () => {
    expect(scrubPii("Fuite au 12 rue des Lilas, appelez-moi au 06 12 34 56 78 ou jean@x.fr")).toBe(
      "Fuite au [adresse masquée], appelez-moi au [téléphone masqué] ou [e-mail masqué]",
    );
  });
  it("ne garde que la commune", () => {
    expect(communeFromAddress("12 rue des Lilas 11000 Carcassonne")).toBe("11000 Carcassonne");
    expect(communeFromAddress(null)).toBeNull();
  });
  it("résumé : métier, commune, budget, besoin expurgé", () => {
    const s = buildAnonymizedSummary({
      trade: "plombier",
      trade_category: "plomberie-chauffage",
      address_label: "3 impasse du Moulin 11300 Limoux",
      estimate_min: 800,
      estimate_max: 1200,
      need_summary: "Remplacer un chauffe-eau 200 L au 3 impasse du Moulin.",
    });
    expect(s).toEqual({
      trade: "Plombier",
      commune: "11300 Limoux",
      budget: { min: 800, max: 1200 },
      need: "Remplacer un chauffe-eau 200 L au [adresse masquée].",
    });
  });
});
