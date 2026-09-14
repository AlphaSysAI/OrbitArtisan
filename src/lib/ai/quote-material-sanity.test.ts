import { describe, expect, it } from "vitest";

import { isMasonryUnitMaterial, sanitizeMaterialQuantity } from "./quote-material-sanity";

describe("sanitizeMaterialQuantity", () => {
  it("corrige une erreur ×10 typique sur parpaings", () => {
    const res = sanitizeMaterialQuantity("Parpaing creux", 13000);
    expect(res.quantity).toBe(1300);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it("laisse une quantité réaliste inchangée", () => {
    const res = sanitizeMaterialQuantity("Parpaing creux", 1300);
    expect(res.quantity).toBe(1300);
    expect(res.warnings).toEqual([]);
  });

  it("ignore les matériaux non maçonnerie", () => {
    const res = sanitizeMaterialQuantity("Tuile terre cuite", 13000);
    expect(res.quantity).toBe(13000);
    expect(res.warnings).toEqual([]);
  });
});

describe("isMasonryUnitMaterial", () => {
  it("détecte parpaing et agglo", () => {
    expect(isMasonryUnitMaterial("Parpaing")).toBe(true);
    expect(isMasonryUnitMaterial("Agglo creux")).toBe(true);
  });
});
