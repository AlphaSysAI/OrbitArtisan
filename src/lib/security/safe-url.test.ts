import { describe, expect, it } from "vitest";

import { safeHttpUrl } from "./safe-url";

describe("safeHttpUrl", () => {
  it("accepte http(s)", () => {
    expect(safeHttpUrl(" https://www.pointp.fr/p/123 ")).toBe("https://www.pointp.fr/p/123");
    expect(safeHttpUrl("http://exemple.fr")).toBe("http://exemple.fr/");
  });
  it("refuse les schémas dangereux et le relatif", () => {
    for (const bad of ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "data:text/html,<script>", "vbscript:x", "//evil.fr", "/app", "", null]) {
      expect(safeHttpUrl(bad)).toBeNull();
    }
  });
});
