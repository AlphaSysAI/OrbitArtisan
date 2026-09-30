import { describe, expect, it } from "vitest";

import {
  buildActivateCallForwardingCode,
  CANCEL_CALL_FORWARDING_CODE,
  phoneToNationalUssdDigits,
  ussdToTelHref,
} from "./call-forwarding-ussd";

describe("phoneToNationalUssdDigits", () => {
  it("convertit E.164 FR en 0X…", () => {
    expect(phoneToNationalUssdDigits("+33612345678")).toBe("0612345678");
    expect(phoneToNationalUssdDigits("06 12 34 56 78")).toBe("0612345678");
  });
});

describe("buildActivateCallForwardingCode", () => {
  it("assemble le code vers le numéro Soline (format national)", () => {
    expect(buildActivateCallForwardingCode("+33123456789")).toBe("*61*0123456789*11*12#");
    expect(buildActivateCallForwardingCode("06 12 34 56 78")).toBe("*61*0612345678*11*12#");
  });
});

describe("ussdToTelHref", () => {
  it("encode les dièses", () => {
    expect(ussdToTelHref(CANCEL_CALL_FORWARDING_CODE)).toBe("tel:%23%23002%23");
    expect(ussdToTelHref("*61*0612345678*11*12#")).toBe("tel:*61*0612345678*11*12%23");
  });
});
