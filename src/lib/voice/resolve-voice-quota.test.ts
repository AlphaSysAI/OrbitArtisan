import { describe, expect, it } from "vitest";

import { buildVoiceQuotaSnapshot } from "./resolve-voice-quota";

const MID_MONTH = new Date("2026-09-11T12:00:00.000Z");

describe("buildVoiceQuotaSnapshot", () => {
  it("laisse passer tant qu'il reste du forfait", () => {
    const quota = buildVoiceQuotaSnapshot({
      artisanId: "a1",
      included: 60,
      used: 30,
      allowOverage: false,
      now: MID_MONTH,
    });

    expect(quota.remainingMinutes).toBe(30);
    expect(quota.canAcceptCalls).toBe(true);
  });

  it("bloque au-delà du quota si le dépassement est désactivé", () => {
    const quota = buildVoiceQuotaSnapshot({
      artisanId: "a1",
      included: 60,
      used: 60,
      allowOverage: false,
      now: MID_MONTH,
    });

    expect(quota.remainingMinutes).toBe(0);
    expect(quota.voiceMinutesOverdue).toBe(0);
    expect(quota.canAcceptCalls).toBe(false);
  });

  it("autorise le dépassement refacturable si l'artisan l'a choisi", () => {
    const quota = buildVoiceQuotaSnapshot({
      artisanId: "a1",
      included: 60,
      used: 72,
      allowOverage: true,
      now: MID_MONTH,
    });

    expect(quota.voiceMinutesOverdue).toBe(12);
    expect(quota.canAcceptCalls).toBe(true);
  });

  it("redémarre le compteur au mois suivant", () => {
    const october = buildVoiceQuotaSnapshot({
      artisanId: "a1",
      included: 60,
      used: 0,
      allowOverage: true,
      now: new Date("2026-10-02T09:00:00.000Z"),
    });

    expect(october.periodStart).toBe("2026-10-01T00:00:00.000Z");
    expect(october.remainingMinutes).toBe(60);
  });

  it("bloque le plan Base sans forfait si le dépassement est désactivé", () => {
    const quota = buildVoiceQuotaSnapshot({
      artisanId: "a1",
      included: 0,
      used: 0,
      allowOverage: false,
      now: MID_MONTH,
    });

    expect(quota.canAcceptCalls).toBe(false);
  });
});
