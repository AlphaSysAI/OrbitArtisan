import { describe, expect, it } from "vitest";

import { clampBulkCount, computeRefillCount, readRefillPolicy } from "./voice-pool-refill";

const policy = { minAvailable: 2, targetAvailable: 4, maxTotal: 10, maxPerRun: 3 };

describe("computeRefillCount", () => {
  it("ne fait rien tant que le seuil est atteint", () => {
    expect(computeRefillCount({ available: 2, totalActive: 5, policy })).toBe(0);
  });
  it("remonte au niveau visé, dans la limite par exécution", () => {
    expect(computeRefillCount({ available: 1, totalActive: 5, policy })).toBe(3);
    expect(computeRefillCount({ available: 0, totalActive: 5, policy })).toBe(3);
  });
  it("ne dépasse jamais le plafond total", () => {
    expect(computeRefillCount({ available: 0, totalActive: 9, policy })).toBe(1);
    expect(computeRefillCount({ available: 0, totalActive: 10, policy })).toBe(0);
  });
});

describe("clampBulkCount", () => {
  it("borne la demande admin", () => {
    expect(clampBulkCount(50, 0, 30)).toBe(10);
    expect(clampBulkCount(5, 28, 30)).toBe(2);
    expect(clampBulkCount(0, 0, 30)).toBe(0);
  });
});

describe("readRefillPolicy", () => {
  it("valeurs par défaut prudentes", () => {
    expect(readRefillPolicy({})).toEqual({ minAvailable: 2, targetAvailable: 4, maxTotal: 30, maxPerRun: 5 });
  });
});
