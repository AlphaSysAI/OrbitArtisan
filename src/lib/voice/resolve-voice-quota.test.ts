import { describe, expect, it } from "vitest";

import {
  buildVoiceQuotaSnapshot,
  isBillableCall,
  resolveQuotaPeriod,
  resolveVoiceEntitlement,
} from "./resolve-voice-quota";

const MID_MONTH = new Date("2026-09-11T12:00:00.000Z");
const PRO = { isTrial: false, callsIncluded: 40, overageCallCents: 90 };

describe("resolveVoiceEntitlement", () => {
  it("Pro actif : 40 appels, 0,90 € hors forfait", () => {
    expect(
      resolveVoiceEntitlement({ subscription_plan: "pro", subscription_status: "active", trial_ends_at: null }),
    ).toEqual(PRO);
  });

  it("essai Pro en cours : 10 appels, aucun dépassement", () => {
    expect(
      resolveVoiceEntitlement(
        { subscription_plan: "pro", subscription_status: "trialing", trial_ends_at: "2026-09-20T00:00:00.000Z" },
        MID_MONTH,
      ),
    ).toEqual({ isTrial: true, callsIncluded: 10, overageCallCents: 0 });
  });

  it("essai expiré ou Essentiel : aucun appel", () => {
    expect(
      resolveVoiceEntitlement(
        { subscription_plan: "pro", subscription_status: "trialing", trial_ends_at: "2026-09-01T00:00:00.000Z" },
        MID_MONTH,
      ).callsIncluded,
    ).toBe(0);
    expect(
      resolveVoiceEntitlement({ subscription_plan: "base", subscription_status: "active", trial_ends_at: null })
        .callsIncluded,
    ).toBe(0);
  });
});

describe("isBillableCall", () => {
  it("ne compte que les appels aboutis d'au moins 30 s", () => {
    expect(isBillableCall("completed", 30)).toBe(true);
    expect(isBillableCall("completed", 29)).toBe(false);
    expect(isBillableCall("no-answer", 120)).toBe(false);
  });
});

describe("buildVoiceQuotaSnapshot", () => {
  it("mode complet tant qu'il reste des appels", () => {
    const q = buildVoiceQuotaSnapshot({ artisanId: "a1", entitlement: PRO, callsUsed: 12, overageCapCents: 3000, now: MID_MONTH });
    expect(q.remainingCalls).toBe(28);
    expect(q.mode).toBe("full");
    expect(q.canAcceptCalls).toBe(true);
  });

  it("dépassement facturé tant que l'appel suivant tient sous le plafond", () => {
    const q = buildVoiceQuotaSnapshot({ artisanId: "a1", entitlement: PRO, callsUsed: 72, overageCapCents: 3000, now: MID_MONTH });
    expect(q.overageCalls).toBe(32);
    expect(q.overageAmountCents).toBe(2880);
    expect(q.mode).toBe("full");
  });

  it("passe en message seul au plafond, sans jamais couper la ligne", () => {
    const q = buildVoiceQuotaSnapshot({ artisanId: "a1", entitlement: PRO, callsUsed: 73, overageCapCents: 3000, now: MID_MONTH });
    expect(q.overageAmountCents).toBe(2970);
    expect(q.mode).toBe("message_only");
    expect(q.canAcceptCalls).toBe(true);
  });

  it("plafond à 0 : message seul dès le forfait consommé", () => {
    const q = buildVoiceQuotaSnapshot({ artisanId: "a1", entitlement: PRO, callsUsed: 40, overageCapCents: 0, now: MID_MONTH });
    expect(q.mode).toBe("message_only");
    expect(q.overageAmountCents).toBe(0);
  });

  it("essai : message seul après 10 appels, rien de facturé", () => {
    const q = buildVoiceQuotaSnapshot({
      artisanId: "a1",
      entitlement: { isTrial: true, callsIncluded: 10, overageCallCents: 0 },
      callsUsed: 11,
      overageCapCents: 3000,
      now: MID_MONTH,
    });
    expect(q.mode).toBe("message_only");
    expect(q.overageAmountCents).toBe(0);
  });

  it("redémarre le compteur au mois suivant", () => {
    const q = buildVoiceQuotaSnapshot({
      artisanId: "a1",
      entitlement: PRO,
      callsUsed: 0,
      overageCapCents: 3000,
      now: new Date("2026-10-02T09:00:00.000Z"),
    });
    expect(q.periodStart).toBe("2026-10-01T00:00:00.000Z");
    expect(q.remainingCalls).toBe(40);
  });
});

describe("resolveQuotaPeriod", () => {
  it("essai : les 10 appels couvrent les 30 jours, même à cheval sur deux mois", () => {
    const period = resolveQuotaPeriod(
      { isTrial: true, callsIncluded: 10, overageCallCents: 0 },
      "2026-10-15T10:00:00.000Z",
      new Date("2026-10-02T09:00:00.000Z"),
    );
    expect(period.start.toISOString()).toBe("2026-09-15T10:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-10-15T10:00:00.000Z");
  });

  it("abonné : mois civil", () => {
    const period = resolveQuotaPeriod(PRO, null, MID_MONTH);
    expect(period.start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});
