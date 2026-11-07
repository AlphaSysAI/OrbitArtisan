import { describe, expect, it } from "vitest";

import { getLibrarySheet } from "@/lib/technical-sheets/catalog";
import { TECHNICAL_SHEET_LIBRARY } from "@/lib/technical-sheets/library";
import { highlightParts, matchSheetText, searchTerms, sheetTextSegments } from "@/lib/technical-sheets/sheet-search";

const search = (query: string) =>
  TECHNICAL_SHEET_LIBRARY.filter((s) => matchSheetText(s.title, sheetTextSegments(s), searchTerms(query))).map((s) => s.id);

describe("recherche plein texte", () => {
  it("trouve un mot présent seulement dans les étapes", () => {
    // « peigne » n'est ni dans un titre ni dans les mots-clés du tableau électrique.
    expect(search("peigne")).toContain("elec-poser-raccorder-tableau");
  });

  it("fait ressortir toutes les fiches qui contiennent le mot", () => {
    const found = search("amiante");
    expect(found.length).toBeGreaterThan(3);
    expect(found).toEqual(expect.arrayContaining(["plaq-cloison-distributive", "carr-preparer-support"]));
  });

  it("ignore les accents et exige tous les mots", () => {
    expect(search("differentiel 30 mA").length).toBeGreaterThan(0);
    expect(search("differentiel zzzz")).toHaveLength(0);
  });

  it("donne l'extrait où le mot apparaît", () => {
    const sheet = getLibrarySheet("elec-poser-raccorder-tableau")!;
    const hit = matchSheetText(sheet.title, sheetTextSegments(sheet), searchTerms("peigne"))!;
    expect(hit.inTitle).toBe(false);
    expect(hit.excerpt?.toLowerCase()).toContain("peigne");
  });

  it("classe d'abord les fiches dont le titre correspond", () => {
    const sheet = getLibrarySheet("elec-poser-raccorder-tableau")!;
    const hit = matchSheetText(sheet.title, sheetTextSegments(sheet), searchTerms("tableau"))!;
    expect(hit.inTitle).toBe(true);
    expect(hit.score).toBeGreaterThanOrEqual(100);
  });
});

describe("surlignage", () => {
  it("surligne sans tenir compte des accents", () => {
    const parts = highlightParts("Poser un Différentiel", ["differentiel"]);
    expect(parts).toEqual([
      { text: "Poser un ", match: false },
      { text: "Différentiel", match: true },
    ]);
  });
});
