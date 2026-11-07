import { describe, expect, it } from "vitest";

import { getLibrarySheet } from "@/lib/technical-sheets/catalog";
import { buildSmartSearchPrompt, keepKnownMatches } from "@/lib/technical-sheets/smart-search";

const scope = [getLibrarySheet("plomb-recherche-fuite")!, getLibrarySheet("elec-mise-en-securite")!];

describe("recherche intelligente", () => {
  it("ne présente à l'IA que les fiches du métier affiché", () => {
    const prompt = buildSmartSearchPrompt(scope);
    expect(prompt).toContain("plomb-recherche-fuite");
    expect(prompt).not.toContain("carr-pose-sol-collee");
  });

  it("écarte les identifiants inventés ou hors métier, et les doublons", () => {
    const kept = keepKnownMatches(
      [
        { id: "plomb-recherche-fuite", reason: "Localiser la fuite" },
        { id: "fiche-inventee" },
        { id: "carr-pose-sol-collee" },
        { id: "plomb-recherche-fuite" },
        { id: "elec-mise-en-securite" },
      ],
      scope,
    );
    expect(kept).toEqual([
      { id: "plomb-recherche-fuite", reason: "Localiser la fuite" },
      { id: "elec-mise-en-securite", reason: "" },
    ]);
  });
});
