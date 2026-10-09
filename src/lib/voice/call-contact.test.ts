import { describe, expect, it } from "vitest";

import { normalizeCallContact } from "./call-contact";

describe("normalizeCallContact", () => {
  it("garde un nom et un e-mail valides", () => {
    expect(normalizeCallContact({ customer_name: " Jean  Dupont ", customer_email: "Jean.Dupont @Gmail.com" })).toEqual({
      customerName: "Jean Dupont",
      customerEmail: "jean.dupont@gmail.com",
    });
  });
  it("rejette les valeurs douteuses plutôt que de deviner", () => {
    expect(normalizeCallContact({ customer_name: "null", customer_email: "jean arobase gmail" })).toEqual({
      customerName: null,
      customerEmail: null,
    });
    expect(normalizeCallContact(null)).toEqual({ customerName: null, customerEmail: null });
  });
});
