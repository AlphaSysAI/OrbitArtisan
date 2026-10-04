import { describe, expect, it } from "vitest";

import { isDiscreteUnit, materialLineTotalCents, roundMaterialQuantity } from "./material-quantity";

describe("roundMaterialQuantity", () => {
  it("unités discrètes : entier supérieur", () => {
    expect(roundMaterialQuantity(1061.55, "u")).toBe(1062);
    expect(roundMaterialQuantity(60.66, "sacs")).toBe(61);
    expect(roundMaterialQuantity(2.01, "rouleaux")).toBe(3);
    expect(roundMaterialQuantity(1.2, "forfait")).toBe(2);
    expect(roundMaterialQuantity(3, "U")).toBe(3);
  });

  it("unités continues : 2 décimales, sans sur-arrondi", () => {
    expect(roundMaterialQuantity(27.32, "m³")).toBe(27.32);
    expect(roundMaterialQuantity(7.888, "m³")).toBe(7.89);
    expect(roundMaterialQuantity(151.2, "m²")).toBe(151.2);
    expect(roundMaterialQuantity(40.444, "ml")).toBe(40.44);
    expect(roundMaterialQuantity(6.75, "kg")).toBe(6.75);
    expect(roundMaterialQuantity(1.255, "t")).toBe(1.26);
    expect(roundMaterialQuantity(12.5, "L")).toBe(12.5);
  });

  it("quantité invalide → 0 ; unité vide = continue", () => {
    expect(roundMaterialQuantity(0, "m³")).toBe(0);
    expect(roundMaterialQuantity(Number.NaN, "u")).toBe(0);
    expect(isDiscreteUnit(null)).toBe(false);
    expect(isDiscreteUnit("Sacs")).toBe(true);
  });
});

describe("materialLineTotalCents", () => {
  it("quantité décimale × PU, arrondi au centime", () => {
    expect(materialLineTotalCents(27.32, 16250)).toBe(443950);
    expect(materialLineTotalCents(7.89, 16250)).toBe(128213); // 128 212,5 → 128 213
    expect(materialLineTotalCents(3, 1001)).toBe(3003);
  });
});
