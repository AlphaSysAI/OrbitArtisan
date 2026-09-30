import { describe, expect, it } from "vitest";

import { clampBulkCount, computeRefillCount, readRefillPolicy, shouldAlertPoolCapacity } from "./voice-pool-refill";

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

describe("computeRefillCount — file d'attente", () => {
  const big = { minAvailable: 2, targetAvailable: 4, maxTotal: 150, maxPerRun: 8 };
  it("achète pour les abonnés en attente même si le stock atteint le seuil", () => {
    expect(computeRefillCount({ available: 2, totalActive: 20, waiting: 1, policy: big })).toBe(3);
  });
  it("50 inscrits d'un coup : 8 par exécution, jusqu'à vider la file", () => {
    expect(computeRefillCount({ available: 0, totalActive: 10, waiting: 50, policy: big })).toBe(8);
    expect(computeRefillCount({ available: 0, totalActive: 146, waiting: 42, policy: big })).toBe(4);
  });
  it("sans file d'attente, comportement inchangé", () => {
    expect(computeRefillCount({ available: 3, totalActive: 20, waiting: 0, policy: big })).toBe(0);
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
    expect(readRefillPolicy({})).toEqual({ minAvailable: 2, targetAvailable: 4, maxTotal: 30, maxPerRun: 8 });
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
