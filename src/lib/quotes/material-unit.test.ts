import { describe, expect, it } from "vitest";

import { materialUnitLabel, normalizeMaterialUnit, uneceUnitCode } from "./material-unit";

describe("unité marchande", () => {
  it("normalise les saisies courantes", () => {
    expect(normalizeMaterialUnit("m2")).toBe("m²");
    expect(normalizeMaterialUnit("pièces")).toBe("U");
    expect(normalizeMaterialUnit("Sac")).toBe("sacs");
    expect(normalizeMaterialUnit("litres")).toBe("L");
    expect(normalizeMaterialUnit("  ")).toBeNull();
    expect(normalizeMaterialUnit("palette de 60")).toBe("palette de 60");
  });

  it("donne un libellé PDF et un code Factur-X avec repli", () => {
    expect(materialUnitLabel(null)).toBe("u");
    expect(uneceUnitCode("m²")).toBe("MTK");
    expect(uneceUnitCode("ml")).toBe("MTR");
    expect(uneceUnitCode("m3")).toBe("MTQ");
    expect(uneceUnitCode("forfait")).toBe("LS");
    expect(uneceUnitCode("sacs")).toBe("C62");
    expect(uneceUnitCode(null)).toBe("C62");
  });
});
