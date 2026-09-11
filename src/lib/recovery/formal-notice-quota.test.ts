import { describe, expect, it } from "vitest";

import {
  buildFormalNoticeQuota,
  getFormalNoticeQuotaPeriod,
} from "./formal-notice-quota";

const MID_MONTH = new Date("2026-09-11T23:30:00.000Z");

describe("getFormalNoticeQuotaPeriod", () => {
  it("délimite le mois civil courant", () => {
    const { start, end } = getFormalNoticeQuotaPeriod(MID_MONTH);

    expect(start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("passe correctement le changement d'année", () => {
    const { start, end } = getFormalNoticeQuotaPeriod(new Date("2026-12-20T10:00:00.000Z"));

    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("buildFormalNoticeQuota", () => {
  it("laisse le premier envoi du mois inclus", () => {
    const quota = buildFormalNoticeQuota(0, MID_MONTH);

    expect(quota.included).toBe(1);
    expect(quota.remaining).toBe(1);
    expect(quota.nextIsBillable).toBe(false);
  });

  it("rend le deuxième envoi facturable", () => {
    const quota = buildFormalNoticeQuota(1, MID_MONTH);

    expect(quota.remaining).toBe(0);
    expect(quota.nextIsBillable).toBe(true);
  });

  it("reste facturable au-delà, sans reste négatif", () => {
    const quota = buildFormalNoticeQuota(5, MID_MONTH);

    expect(quota.used).toBe(5);
    expect(quota.remaining).toBe(0);
    expect(quota.nextIsBillable).toBe(true);
  });

  it("ne reporte pas le quota non consommé sur le mois suivant", () => {
    // Aucune lettre envoyée en septembre : octobre redémarre à 1, pas à 2.
    const october = buildFormalNoticeQuota(0, new Date("2026-10-02T09:00:00.000Z"));

    expect(october.included).toBe(1);
    expect(october.remaining).toBe(1);
    expect(october.periodStart).toBe("2026-10-01T00:00:00.000Z");
  });
});
