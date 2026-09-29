import { describe, expect, it } from "vitest";

import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("garde les chemins internes", () => {
    expect(safeNextPath("/compte?pending=abc", "/app")).toBe("/compte?pending=abc");
  });

  it("refuse les destinations externes ou ambiguës", () => {
    for (const bad of ["https://evil.fr", "//evil.fr", "/\\evil.fr", "javascript:alert(1)", "", null]) {
      expect(safeNextPath(bad, "/app")).toBe("/app");
    }
  });
});
