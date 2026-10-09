import { describe, expect, it } from "vitest";

import { filterSlotsByPreference } from "./visit-hours";

// Paris = UTC+2 en octobre
const slots = [
  new Date("2026-10-13T07:00:00Z"), // mardi 9 h
  new Date("2026-10-13T09:30:00Z"), // mardi 11 h 30
  new Date("2026-10-13T10:00:00Z"), // mardi 12 h
  new Date("2026-10-14T13:00:00Z"), // mercredi 15 h
  new Date("2026-10-14T22:30:00Z"), // jeudi 0 h 30 à Paris (mercredi en UTC)
];

describe("filterSlotsByPreference", () => {
  it("sans préférence : tout", () => {
    expect(filterSlotsByPreference(slots, {}, "Europe/Paris")).toHaveLength(slots.length);
  });
  it("matin : avant midi heure de Paris", () => {
    expect(filterSlotsByPreference(slots, { date: "2026-10-13", partOfDay: "matin" }, "Europe/Paris")).toEqual(slots.slice(0, 2));
  });
  it("après-midi : à partir de midi", () => {
    expect(filterSlotsByPreference(slots, { date: "2026-10-13", partOfDay: "apres-midi" }, "Europe/Paris")).toEqual([slots[2]]);
  });
  it("jour calendaire dans le fuseau de l'entreprise, pas en UTC", () => {
    expect(filterSlotsByPreference(slots, { date: "2026-10-15" }, "Europe/Paris")).toEqual([slots[4]]);
    expect(filterSlotsByPreference(slots, { date: "2026-10-14" }, "Europe/Paris")).toEqual([slots[3]]);
  });
});
