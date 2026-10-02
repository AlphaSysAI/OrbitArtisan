import { describe, expect, it } from "vitest";

import { findReferencePrice, normalizeUnit } from "./recipe-reference-prices";

describe("prix de référence de la bibliothèque", () => {
  it("trouve l'article de recette, même unité", () => {
    expect(findReferencePrice("Brique creuse de structure 20 cm (type Calibric / BGV)", "u")?.priceHtEur).toBe(3.4);
    expect(findReferencePrice("Parpaing creux 20x20x50", "U")?.priceHtEur).toBe(1.25);
    expect(findReferencePrice("Écran de sous-toiture HPV R2", "m²")?.priceHtEur).toBe(1.95);
  });

  it("tolère une formulation proche", () => {
    expect(findReferencePrice("Ecran sous toiture HPV R2", "m2")?.priceHtEur).toBe(1.95);
  });

  it("refuse une autre unité ou un autre article (→ web)", () => {
    expect(findReferencePrice("Parpaing creux 20x20x50", "m²")).toBeNull();
    expect(findReferencePrice("Mortier-colle pour briques joint mince", "kg")).toBeNull();
    expect(findReferencePrice("Tuile ardoise naturelle", "u")).toBeNull();
    expect(findReferencePrice("Parpaing creux 20x20x50", null)).toBeNull();
  });

  it("normalise les unités", () => {
    expect(normalizeUnit("Sacs")).toBe("sac");
    expect(normalizeUnit("m²")).toBe("m2");
    expect(normalizeUnit("pièces")).toBe("u");
  });
});
