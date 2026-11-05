import { describe, expect, it } from "vitest";

import { buildQuoteSendQuota, isQuoteLimitDbError } from "./quote-send-quota";

describe("buildQuoteSendQuota", () => {
  it("Essentiel : bloque au 51e envoi", () => {
    expect(buildQuoteSendQuota(50, 49).reached).toBe(false);
    expect(buildQuoteSendQuota(50, 50)).toEqual({ limit: 50, used: 50, remaining: 0, reached: true });
  });

  it("Ultra : jamais bloqué", () => {
    expect(buildQuoteSendQuota(null, 5000)).toEqual({ limit: null, used: 5000, remaining: null, reached: false });
  });
});

describe("isQuoteLimitDbError", () => {
  it("reconnaît l'erreur de quota renvoyée par la base", () => {
    expect(isQuoteLimitDbError({ message: "quote_monthly_limit_reached" })).toBe(true);
    expect(isQuoteLimitDbError({ message: "inconsistent_quote_total" })).toBe(false);
    expect(isQuoteLimitDbError(null)).toBe(false);
  });
});
