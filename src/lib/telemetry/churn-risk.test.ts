import { describe, expect, it } from "vitest";

import { assessChurnRisk, businessDaysSinceLastActive, reengagementMessage, type RiskInput } from "./churn-risk";

const now = new Date("2026-10-02T08:00:00Z"); // vendredi
const base: RiskInput = {
  now,
  accountCreatedAt: new Date("2026-08-01T00:00:00Z"),
  activeDays: ["2026-10-01", "2026-09-30"],
  callsLast7: 8,
  callsPrev21: 24,
  pendingIntakesOver48h: 0,
  oldestPendingIntakeName: null,
  quotesSentLast14: 4,
  acceptedNotInvoiced: 0,
  voiceNumberAssignedAt: new Date("2026-08-02T00:00:00Z"),
  callsSinceNumberAssigned: 120,
  trialDaysRemaining: null,
};

describe("risque d'abandon", () => {
  it("compte actif et utilisé : ok", () => {
    expect(assessChurnRisk(base)).toMatchObject({ level: "ok", score: 0 });
  });

  it("jours ouvrés d'absence (week-end non compté)", () => {
    // Dernier passage ven. 25 : lun 28 → jeu 1er = 4 jours ouvrés (le jour courant ne compte pas).
    expect(businessDaysSinceLastActive(["2026-09-25"], now)).toBe(4);
    expect(businessDaysSinceLastActive(["2026-09-24"], now)).toBe(5);
  });

  it("renvoi jamais activé + devis qui dorment → critique, signal renvoi en tête", () => {
    const r = assessChurnRisk({
      ...base,
      callsLast7: 0,
      callsPrev21: 0,
      callsSinceNumberAssigned: 0,
      voiceNumberAssignedAt: new Date("2026-09-20T00:00:00Z"),
      pendingIntakesOver48h: 3,
      quotesSentLast14: 0,
      activeDays: [],
    });
    expect(r.level).toBe("critical");
    expect(r.signals[0]!.code).toBe("forwarding_inactive");
  });

  it("chute d'appels et devis en attente > 48 h → à risque", () => {
    const r = assessChurnRisk({ ...base, callsLast7: 2, pendingIntakesOver48h: 1, oldestPendingIntakeName: "M. Martin" });
    expect(r.level).toBe("at_risk");
    expect(r.signals.map((s) => s.code)).toEqual(["stale_intakes", "call_drop"]);
  });

  it("message SMS court (1 segment), concret, sans emoji", () => {
    const r = assessChurnRisk({ ...base, pendingIntakesOver48h: 2, oldestPendingIntakeName: "Mme Durand" });
    const msg = reengagementMessage(r.signals[0]!, { url: "https://solinebtp.fr/app/appels", acceptedNotInvoiced: 0 });
    expect(msg.length).toBeLessThanOrEqual(160);
    expect(msg).toContain("2 devis prepares");
    expect(/[^\x00-\x7F]/.test(msg)).toBe(false);
  });
});
