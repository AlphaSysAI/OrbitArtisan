import { describe, expect, it } from "vitest";

import { formatDateFr, formatDateTimeFr, formatTimeFr, parisDayKey } from "./date";

describe("format/date (Europe/Paris)", () => {
  it("affiche l'heure de Paris, pas celle du serveur", () => {
    expect(formatDateTimeFr("2026-10-01T22:30:00Z")).toBe("02/10/2026 00:30");
    expect(formatTimeFr("2026-01-15T08:05:00Z")).toBe("09:05");
  });

  it("une date seule ne glisse jamais d'un jour", () => {
    expect(formatDateFr("2026-10-02")).toBe("02/10/2026");
    expect(formatDateFr("2026-10-02", { dateStyle: "long" })).toBe("2 octobre 2026");
  });

  it("clé de jour parisienne", () => {
    expect(parisDayKey("2026-10-01T22:30:00Z")).toBe("2026-10-02");
    expect(parisDayKey("2026-10-02")).toBe("2026-10-02");
  });
});
