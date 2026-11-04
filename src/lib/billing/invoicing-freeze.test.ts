import { describe, expect, it } from "vitest";

import {
  B2B_INVOICING_FROZEN,
  B2C_INVOICING_FROZEN,
  frozenInvoicingMessageFor,
  frozenInvoicingResult,
  isB2BPdfTransitionActive,
  isDraftInvoicingFrozenForCustomer,
} from "./invoicing-freeze";

const DURING_TRANSITION = new Date("2026-11-04T12:00:00+01:00");
const LAST_DAY = new Date("2027-08-31T23:59:00+02:00");
const AFTER_TRANSITION = new Date("2027-09-01T00:00:00+02:00");

describe("isDraftInvoicingFrozenForCustomer", () => {
  it("suit B2B_INVOICING_FROZEN pour un client B2B après la période transitoire", () => {
    expect(isDraftInvoicingFrozenForCustomer("b2b", AFTER_TRANSITION)).toBe(B2B_INVOICING_FROZEN);
  });

  it("suit B2C_INVOICING_FROZEN pour un client B2C", () => {
    expect(isDraftInvoicingFrozenForCustomer("b2c", DURING_TRANSITION)).toBe(B2C_INVOICING_FROZEN);
    expect(isDraftInvoicingFrozenForCustomer("b2c", AFTER_TRANSITION)).toBe(B2C_INVOICING_FROZEN);
  });

  it("B2B débloqué en PDF jusqu'au 31/08/2027 inclus, regelé le 01/09/2027 sans PA", () => {
    expect(isDraftInvoicingFrozenForCustomer("b2b", DURING_TRANSITION)).toBe(false);
    expect(isDraftInvoicingFrozenForCustomer("b2b", LAST_DAY)).toBe(false);
    expect(isDraftInvoicingFrozenForCustomer("b2b", AFTER_TRANSITION)).toBe(true);
  });
});

describe("isB2BPdfTransitionActive", () => {
  it("n'est actif qu'avant le 1er septembre 2027", () => {
    expect(isB2BPdfTransitionActive(DURING_TRANSITION)).toBe(true);
    expect(isB2BPdfTransitionActive(LAST_DAY)).toBe(true);
    expect(isB2BPdfTransitionActive(AFTER_TRANSITION)).toBe(false);
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
