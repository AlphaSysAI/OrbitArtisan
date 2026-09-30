import { describe, expect, it } from "vitest";

import { clampBulkCount, readRefillPolicy, shouldAlertPoolCapacity } from "./voice-pool-refill";

describe("clampBulkCount", () => {
  it("borne la demande admin", () => {
    expect(clampBulkCount(50, 0, 30)).toBe(10);
    expect(clampBulkCount(5, 28, 30)).toBe(2);
    expect(clampBulkCount(0, 0, 30)).toBe(0);
  });
});

describe("readRefillPolicy", () => {
  it("valeurs par défaut prudentes", () => {
    expect(readRefillPolicy({})).toEqual({ maxTotal: 30 });
    expect(readRefillPolicy({ VOICE_POOL_MAX_TOTAL: "300" })).toEqual({ maxTotal: 300 });
  });
});

describe("shouldAlertPoolCapacity", () => {
  it("alerte à partir de 80 % du plafond", () => {
    expect(shouldAlertPoolCapacity(23, 30)).toBe(false);
    expect(shouldAlertPoolCapacity(24, 30)).toBe(true);
    expect(shouldAlertPoolCapacity(240, 300)).toBe(true);
    expect(shouldAlertPoolCapacity(239, 300)).toBe(false);
  });
});
