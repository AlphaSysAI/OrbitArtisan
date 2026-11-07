import { describe, expect, it } from "vitest";

import { getLibrarySheet } from "@/lib/technical-sheets/catalog";
import { parseStoredSheetContent, technicalSheetAiResponseSchema } from "@/lib/technical-sheets/sheet-schema";
import { libraryTrust } from "@/lib/technical-sheets/trust";

describe("contenu des fiches IA", () => {
  it("accepte une fiche au format de la bibliothèque", () => {
    const sheet = getLibrarySheet("elec-poser-raccorder-tableau")!;
    expect(parseStoredSheetContent(sheet)).not.toBeNull();
  });

  it("rejette un contenu incomplet (pas de sécurité, une seule étape)", () => {
    expect(
      parseStoredSheetContent({ title: "Test", summary: "Résumé", tools: [], materials: [], safety: [], steps: [], checks: [], norms: [] }),
    ).toBeNull();
  });

  it("lit un refus de l'IA", () => {
    const parsed = technicalSheetAiResponseSchema.parse({ refused: true, refusalReason: "Hors bâtiment" });
    expect(parsed.refused).toBe(true);
    expect(parsed.sheet).toBeUndefined();
  });
});

describe("statut affiché d'une fiche de la bibliothèque", () => {
  it("est en relecture sans avis", () => {
    expect(libraryTrust(undefined)).toEqual({ kind: "in_review" });
  });

  it("est retirée quand elle est à corriger", () => {
    expect(libraryTrust({ sheetId: "x", status: "needs_changes", reviewerName: null, note: null, reviewedAt: "2026-11-07" })).toBeNull();
  });

  it("affiche le relecteur quand elle est vérifiée", () => {
    expect(
      libraryTrust({ sheetId: "x", status: "verified", reviewerName: "Jean, électricien", note: null, reviewedAt: "2026-11-07" }),
    ).toEqual({ kind: "verified", reviewerName: "Jean, électricien", reviewedAt: "2026-11-07" });
  });
});
