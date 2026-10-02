import { describe, expect, it } from "vitest";

import { formatCents, formatEuros } from "./money";

const nbsp = (s: string) => s.replace(/[  ]/g, " ");

describe("format/money", () => {
  it("formate centimes et euros", () => {
    expect(nbsp(formatCents(123456))).toBe("1 234,56 €");
    expect(nbsp(formatCents(null))).toBe("0,00 €");
    expect(nbsp(formatEuros(12.5))).toBe("12,50 €");
  });
});
