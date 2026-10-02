import { describe, expect, it } from "vitest";

import { MaterialTakeoffSchema } from "./quote-material-takeoff";
import { calculateTakeoffFromRecipe, findWorkRecipe, listWorkRecipes } from "./work-recipes";

describe("matrice d'ouvrages", () => {
  it("chaque recette répartit 100 % de la main-d'œuvre", () => {
    for (const r of listWorkRecipes()) {
      const total = r.labor_phases.reduce((a, p) => a + p.share, 0);
      expect(Math.round(total * 1000) / 1000, r.id).toBe(1);
    }
  });

  it("recette inconnue → null", () => {
    expect(findWorkRecipe("toiture_zinc")).toBeNull();
    expect(findWorkRecipe(null)).toBeNull();
  });
});

describe("calculateTakeoffFromRecipe", () => {
  const roof = calculateTakeoffFromRecipe("couverture_toiture_tuile_fermette", 135);
  const qty = (name: string) => roof.materials.find((m) => m.name_generic === name)?.quantity;

  it("applique Q × ratio (centième supérieur, entier pour les unités discrètes)", () => {
    expect(qty("Écran de sous-toiture HPV R2")).toBe(151.2); // pas 151,21 (artefact flottant)
    expect(qty("Liteau sapin traité 27x40")).toBe(405);
    expect(qty("Tuile terre cuite mécanique grand moule")).toBe(1418); // 1417,5 → 1418 u
    expect(qty("Tuile faîtière terre cuite")).toBe(16.2);
    expect(qty("Pointes et fixations charpente")).toBe(6.75);
  });

  it("calcule les heures et des phases dont la somme est exacte", () => {
    expect(roof.labor_hours_estimate).toBe(121.5);
    expect(roof.labor_phases.map((p) => p.hours)).toEqual([42.5, 36.5, 42.5]);
    expect(roof.labor_phases.reduce((a, p) => a + p.hours, 0)).toBeCloseTo(121.5, 5);
  });

  it("documente la recette et reste conforme au schéma de métré", () => {
    expect(roof.assumptions[0]).toContain("Toiture neuve");
    expect(roof.matched_recipe_id).toBe("couverture_toiture_tuile_fermette");
    expect(roof.masonry_wall_area_m2).toBeNull();
    expect(MaterialTakeoffSchema.safeParse(roof).success).toBe(true);
  });

  it("arrondit les sacs et unités à l'entier supérieur", () => {
    const wall = calculateTakeoffFromRecipe("maconnerie_mur_parpaing_20", 20);
    expect(wall.materials.find((m) => m.unit === "sacs")?.quantity).toBe(12);
    expect(wall.materials[0]!.quantity).toBe(210);
  });

  it("refuse une recette inconnue ou une quantité aberrante", () => {
    expect(() => calculateTakeoffFromRecipe("inconnue", 10)).toThrow();
    expect(() => calculateTakeoffFromRecipe("peinture_murs_et_plafonds", 0)).toThrow();
    expect(() => calculateTakeoffFromRecipe("peinture_murs_et_plafonds", 1e6)).toThrow();
  });
});
