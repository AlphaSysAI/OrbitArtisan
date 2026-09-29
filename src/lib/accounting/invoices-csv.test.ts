import { describe, expect, it } from "vitest";

import { escapeCsv } from "./invoices-csv";

describe("escapeCsv", () => {
  it("neutralise les formules dans les cellules texte", () => {
    expect(escapeCsv('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(escapeCsv("+33 6 12")).toBe("'+33 6 12");
    expect(escapeCsv("-2+3")).toBe("'-2+3");
    expect(escapeCsv("@SUM(A1)")).toBe("'@SUM(A1)");
  });
  it("laisse intacts textes normaux et montants", () => {
    expect(escapeCsv("Dupont")).toBe("Dupont");
    expect(escapeCsv(-1250)).toBe("-1250");
    expect(escapeCsv("Dupont, Fils")).toBe('"Dupont, Fils"');
    expect(escapeCsv(null)).toBe("");
  });
});
