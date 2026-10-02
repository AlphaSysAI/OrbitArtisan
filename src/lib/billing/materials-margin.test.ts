import { describe, expect, it } from "vitest";

import { applyMaterialsMargin, materialCostRatioFromMargin, parseMaterialsMarginRate } from "./materials-margin";

describe("marge fournitures", () => {
  it("applique le pourcentage au prix d'achat (2,20 € à 30 % → 2,86 €)", () => {
    expect(applyMaterialsMargin(2.2, 30)).toBe(2.86);
    expect(applyMaterialsMargin(2.2, 0)).toBe(2.2);
    expect(applyMaterialsMargin(10, null)).toBe(10);
    expect(applyMaterialsMargin(1.15, 15)).toBe(1.32);
  });

  it("lit la saisie des réglages", () => {
    expect(parseMaterialsMarginRate("30")).toBe(30);
    expect(parseMaterialsMarginRate("12,5 %")).toBe(12.5);
    expect(parseMaterialsMarginRate("")).toBe(0);
    expect(parseMaterialsMarginRate("-5")).toBeNull();
    expect(parseMaterialsMarginRate("500")).toBeNull();
  });

  it("donne la part coût du prix de vente", () => {
    expect(materialCostRatioFromMargin(25)).toBeCloseTo(0.8, 5);
    expect(materialCostRatioFromMargin(0)).toBeUndefined();
  });
});
