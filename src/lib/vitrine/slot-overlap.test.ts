import { describe, expect, it } from "vitest";

import { filterFreeSlots, overlapsBusy } from "./slot-overlap";

const busy = [{ start: "2026-09-29T12:00:00.000Z", end: "2026-09-29T13:00:00.000Z" }]; // 14 h – 15 h à Paris

describe("créneaux de la vitrine", () => {
  it("retire un créneau qui chevauche un RDV existant, même partiellement", () => {
    expect(overlapsBusy("2026-09-29T12:00:00.000Z", 60, busy)).toBe(true);
    expect(overlapsBusy("2026-09-29T11:30:00.000Z", 45, busy)).toBe(true);
    expect(overlapsBusy("2026-09-29T12:45:00.000Z", 30, busy)).toBe(true);
  });

  it("garde les créneaux contigus", () => {
    expect(overlapsBusy("2026-09-29T11:00:00.000Z", 60, busy)).toBe(false);
    expect(overlapsBusy("2026-09-29T13:00:00.000Z", 60, busy)).toBe(false);
  });

  it("filtre une journée", () => {
    const slots = ["2026-09-29T11:00:00.000Z", "2026-09-29T12:00:00.000Z", "2026-09-29T13:00:00.000Z"];
    expect(filterFreeSlots(slots, 60, busy)).toEqual(["2026-09-29T11:00:00.000Z", "2026-09-29T13:00:00.000Z"]);
  });
});
