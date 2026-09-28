import { describe, expect, it } from "vitest";

import {
  computeVisitSlots,
  emptyVisitHours,
  formatSlotForSpeech,
  parseVisitHours,
  pickProposedSlots,
  zonedWallTimeToUtc,
} from "./visit-hours";

describe("zonedWallTimeToUtc", () => {
  it("convertit l'heure de Paris en été (UTC+2)", () => {
    expect(zonedWallTimeToUtc({ year: 2026, month: 9, day: 29 }, "17:00").toISOString()).toBe(
      "2026-09-29T15:00:00.000Z",
    );
  });

  it("convertit l'heure de Paris en hiver (UTC+1)", () => {
    expect(zonedWallTimeToUtc({ year: 2026, month: 12, day: 1 }, "09:30").toISOString()).toBe(
      "2026-12-01T08:30:00.000Z",
    );
  });
});

describe("parseVisitHours", () => {
  it("accepte et trie des plages valides", () => {
    const res = parseVisitHours({ "2": [{ start: "17:00", end: "19:00" }, { start: "08:00", end: "09:00" }] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value["2"].map((r) => r.start)).toEqual(["08:00", "17:00"]);
  });

  it("refuse une plage inversée", () => {
    expect(parseVisitHours({ "1": [{ start: "18:00", end: "17:00" }] }).ok).toBe(false);
  });

  it("refuse des plages qui se chevauchent", () => {
    expect(
      parseVisitHours({ "1": [{ start: "08:00", end: "10:00" }, { start: "09:00", end: "11:00" }] }).ok,
    ).toBe(false);
  });
});

describe("computeVisitSlots", () => {
  const hours = { ...emptyVisitHours(), "2": [{ start: "17:00", end: "19:00" }], "4": [{ start: "17:00", end: "19:00" }] };
  // Lundi 28/09/2026 10:00 à Paris.
  const now = new Date("2026-09-28T08:00:00.000Z");

  it("propose les créneaux des plages, en heure de Paris", () => {
    const slots = computeVisitSlots({ hours, durationMinutes: 60, busy: [], now, days: 3 });
    expect(slots.map((s) => s.toISOString())).toEqual([
      "2026-09-29T15:00:00.000Z",
      "2026-09-29T16:00:00.000Z",
      "2026-10-01T15:00:00.000Z",
      "2026-10-01T16:00:00.000Z",
    ]);
  });

  it("ne déborde jamais de la plage", () => {
    const slots = computeVisitSlots({ hours, durationMinutes: 90, busy: [], now, days: 1 });
    expect(slots.map((s) => s.toISOString())).toEqual(["2026-09-29T15:00:00.000Z"]);
  });

  it("exclut les créneaux occupés (RDV en attente compris)", () => {
    const slots = computeVisitSlots({
      hours,
      durationMinutes: 60,
      busy: [{ start: new Date("2026-09-29T15:30:00.000Z"), end: new Date("2026-09-29T16:30:00.000Z") }],
      now,
      days: 1,
    });
    expect(slots).toEqual([]);
  });

  it("respecte le délai minimum avant le premier créneau", () => {
    const lateNow = new Date("2026-09-29T14:30:00.000Z"); // mardi 16:30 à Paris
    const slots = computeVisitSlots({ hours, durationMinutes: 60, busy: [], now: lateNow, days: 0 });
    expect(slots).toEqual([]);
  });
});

describe("pickProposedSlots", () => {
  it("étale les propositions sur des jours différents", () => {
    const slots = [
      new Date("2026-09-29T15:00:00.000Z"),
      new Date("2026-09-29T16:00:00.000Z"),
      new Date("2026-10-01T15:00:00.000Z"),
    ];
    expect(pickProposedSlots(slots, 2).map((s) => s.toISOString())).toEqual([
      "2026-09-29T15:00:00.000Z",
      "2026-10-01T15:00:00.000Z",
    ]);
  });
});

describe("formatSlotForSpeech", () => {
  it("donne un libellé oral en heure de Paris", () => {
    expect(formatSlotForSpeech(new Date("2026-09-29T15:30:00.000Z"))).toBe("mardi 29 septembre à 17 h 30");
    expect(formatSlotForSpeech(new Date("2026-09-29T15:00:00.000Z"))).toBe("mardi 29 septembre à 17 h");
  });
});
