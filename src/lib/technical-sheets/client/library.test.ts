import { describe, expect, it } from "vitest";

import { CLIENT_SHEET_LIBRARY, getClientSheet } from "@/lib/technical-sheets/client/library";
import { CLIENT_SHEET_DOMAINS } from "@/lib/technical-sheets/client/types";
import { isValidTradeSelection } from "@/lib/trades/taxonomy";

describe("fiches dépannage des particuliers", () => {
  it("ont des identifiants uniques, préfixés et valides pour la base", () => {
    const ids = CLIENT_SHEET_LIBRARY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^client-[a-z0-9-]{3,110}$/);
  });

  it("proposent toutes un métier existant pour la mise en relation", () => {
    for (const sheet of CLIENT_SHEET_LIBRARY) {
      expect(isValidTradeSelection(sheet.proTrade.categoryId, sheet.proTrade.tradeId), sheet.id).toBe(true);
    }
  });

  it("disent toutes quand appeler un professionnel et commencent par la sécurité ou une étape claire", () => {
    for (const sheet of CLIENT_SHEET_LIBRARY) {
      expect(sheet.whenToCallPro.length, sheet.id).toBeGreaterThan(0);
      expect(sheet.steps.length, sheet.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("couvrent chaque famille de pannes", () => {
    for (const domain of CLIENT_SHEET_DOMAINS) {
      expect(CLIENT_SHEET_LIBRARY.some((s) => s.domain === domain.id), domain.id).toBe(true);
    }
  });

  it("donnent les numéros d'urgence gaz et secours", () => {
    const gaz = getClientSheet("client-odeur-gaz")!;
    const text = JSON.stringify(gaz);
    expect(text).toContain("0 800 47 33 33");
    expect(text).toContain("112");
  });

  it("n'expliquent jamais d'intervention dans le tableau électrique", () => {
    for (const sheet of CLIENT_SHEET_LIBRARY.filter((s) => s.domain === "electricite")) {
      const steps = sheet.steps.flatMap((s) => s.details).join(" ").toLowerCase();
      expect(steps, sheet.id).not.toMatch(/dénuder|raccorder les fils|démonter la prise|ouvrir le capot/);
    }
  });
});
