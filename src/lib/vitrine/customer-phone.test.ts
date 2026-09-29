import { describe, expect, it } from "vitest";

import { normalizeCustomerPhone } from "./customer-phone";

describe("normalizeCustomerPhone", () => {
  it("accepte les formats français courants", () => {
    expect(normalizeCustomerPhone("06 12 34 56 78")).toBe("+33612345678");
    expect(normalizeCustomerPhone("06.12.34.56.78")).toBe("+33612345678");
    expect(normalizeCustomerPhone("+33 4 68 12 34 56")).toBe("+33468123456");
    expect(normalizeCustomerPhone("0033612345678")).toBe("+33612345678");
  });

  it("accepte un numéro étranger au format international", () => {
    expect(normalizeCustomerPhone("+32 470 12 34 56")).toBe("+32470123456");
  });

  it("refuse vide, trop court ou français incomplet", () => {
    expect(normalizeCustomerPhone("")).toBeNull();
    expect(normalizeCustomerPhone("0612")).toBeNull();
    expect(normalizeCustomerPhone("06 12 34 56")).toBeNull();
    expect(normalizeCustomerPhone("+33 6 12 34 56")).toBeNull();
  });
});
