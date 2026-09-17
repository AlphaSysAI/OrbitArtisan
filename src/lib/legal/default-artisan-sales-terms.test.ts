import { describe, expect, it } from "vitest";

import { splitSalesTermsLines } from "@/lib/legal/default-artisan-sales-terms";

describe("splitSalesTermsLines", () => {
  it("retourne un tableau vide si texte absent", () => {
    expect(splitSalesTermsLines(null)).toEqual([]);
    expect(splitSalesTermsLines("   ")).toEqual([]);
  });

  it("découpe par lignes et ignore les lignes vides", () => {
    expect(splitSalesTermsLines("Ligne 1\n\nLigne 2\r\n  ")).toEqual(["Ligne 1", "Ligne 2"]);
  });
});
