import { describe, expect, it } from "vitest";

import {
  B2B_INVOICING_FROZEN,
  B2C_INVOICING_FROZEN,
  frozenInvoicingMessageFor,
  frozenInvoicingResult,
  isDraftInvoicingFrozenForCustomer,
} from "./invoicing-freeze";

describe("isDraftInvoicingFrozenForCustomer", () => {
  it("suit B2B_INVOICING_FROZEN pour un client B2B", () => {
    expect(isDraftInvoicingFrozenForCustomer("b2b")).toBe(B2B_INVOICING_FROZEN);
  });

  it("suit B2C_INVOICING_FROZEN pour un client B2C", () => {
    expect(isDraftInvoicingFrozenForCustomer("b2c")).toBe(B2C_INVOICING_FROZEN);
  });

  it("Vague 7 : B2C débloqué, B2B toujours gelé (état attendu au 17/09/2026)", () => {
    expect(isDraftInvoicingFrozenForCustomer("b2c")).toBe(false);
    expect(isDraftInvoicingFrozenForCustomer("b2b")).toBe(true);
  });
});

describe("frozenInvoicingMessageFor", () => {
  it("renvoie un message distinct selon le type de client", () => {
    expect(frozenInvoicingMessageFor("b2b")).toMatch(/professionnel/i);
    expect(frozenInvoicingMessageFor("b2c")).not.toBe(frozenInvoicingMessageFor("b2b"));
  });
});

describe("frozenInvoicingResult", () => {
  it("renvoie un résultat d'erreur exploitable par les server actions", () => {
    expect(frozenInvoicingResult()).toEqual({ ok: false, error: "invoicing_frozen" });
  });
});
