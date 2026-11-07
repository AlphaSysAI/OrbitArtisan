import { describe, expect, it } from "vitest";

import { getLibrarySheet, libraryFamilies, searchLibrarySheets, sheetMatchesTrade } from "@/lib/technical-sheets/catalog";
import { TECHNICAL_SHEET_LIBRARY } from "@/lib/technical-sheets/library";
import { TRADE_CATEGORIES } from "@/lib/trades/taxonomy";

const tradeIds = new Set(TRADE_CATEGORIES.flatMap((c) => c.trades.map((t) => t.id)));
const categoryIds = new Set(TRADE_CATEGORIES.map((c) => c.id));

describe("bibliothèque des fiches techniques", () => {
  it("a des identifiants uniques et valides pour la base", () => {
    const ids = TECHNICAL_SHEET_LIBRARY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{3,120}$/);
  });

  it("ne référence que des familles et métiers existants", () => {
    for (const sheet of TECHNICAL_SHEET_LIBRARY) {
      expect(categoryIds.has(sheet.tradeCategoryId), sheet.id).toBe(true);
      for (const tradeId of sheet.tradeIds) expect(tradeIds.has(tradeId), `${sheet.id} → ${tradeId}`).toBe(true);
    }
  });

  it("donne à chaque fiche un contenu complet", () => {
    for (const sheet of TECHNICAL_SHEET_LIBRARY) {
      expect(sheet.steps.length, sheet.id).toBeGreaterThanOrEqual(3);
      expect(sheet.safety.length, sheet.id).toBeGreaterThan(0);
      expect(sheet.checks.length, sheet.id).toBeGreaterThan(0);
      expect(sheet.norms.length, sheet.id).toBeGreaterThan(0);
      for (const step of sheet.steps) expect(step.details.length, `${sheet.id} / ${step.title}`).toBeGreaterThan(0);
    }
  });

  it("couvre au moins 10 fiches pour chacun des 5 métiers de départ", () => {
    for (const trade of ["electricien", "plombier", "plaquiste", "carreleur", "peintre-batiment"]) {
      const count = TECHNICAL_SHEET_LIBRARY.filter((s) => s.tradeIds.includes(trade)).length;
      expect(count, trade).toBeGreaterThanOrEqual(10);
    }
  });
});

describe("recherche et filtre par métier", () => {
  it("trouve la fiche tableau électrique sans accents", () => {
    const found = searchLibrarySheets("tableau electrique");
    expect(found.map((s) => s.id)).toContain("elec-poser-raccorder-tableau");
  });

  it("exige tous les mots cherchés", () => {
    expect(searchLibrarySheets("tableau zzzz")).toHaveLength(0);
  });

  it("filtre par métier", () => {
    const sheet = getLibrarySheet("elec-poser-raccorder-tableau")!;
    expect(sheetMatchesTrade(sheet, "electricite", "electricien")).toBe(true);
    expect(sheetMatchesTrade(sheet, "electricite", "antenniste")).toBe(false);
  });

  it("liste les familles qui ont des fiches", () => {
    const families = libraryFamilies();
    expect(families.find((f) => f.id === "electricite")?.count).toBeGreaterThanOrEqual(10);
    expect(families.every((f) => f.count > 0)).toBe(true);
  });
});
