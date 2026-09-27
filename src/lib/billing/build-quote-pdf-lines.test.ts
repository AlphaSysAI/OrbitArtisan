import { describe, expect, it } from "vitest";

import {
  buildQuotePdfTableLines,
  computeVatBreakdown,
  sumQuoteTotals,
} from "@/lib/billing/build-quote-pdf-lines";

describe("buildQuotePdfTableLines", () => {
  it("répartit la main-d'oeuvre par prestation et calcule la TVA", () => {
    const lines = buildQuotePdfTableLines({
      services: [
        { service_title: "Pose carrelage", duration_minutes: 120, line_total: null, unit_price: null },
        { service_title: "Préparation", duration_minutes: 60, line_total: null, unit_price: null },
      ],
      materials: [
        {
          label: "Colle",
          quantity: 2,
          unit_price: 1500,
          line_total: 3000,
          vat_rate: 20,
          exclude_from_invoice: false,
        },
      ],
      laborTotalCents: 9000,
      laborDurationMinutes: 180,
      laborRatePerHourCents: 3000,
      defaultVatRate: 10,
    });

    expect(lines).toHaveLength(3);
    expect(lines[0]?.lineTotalCents).toBe(6000);
    expect(lines[0]?.vatRate).toBe(10);
    expect(lines[2]?.lineTotalCents).toBe(3000);

    const breakdown = computeVatBreakdown(lines);
    const totals = sumQuoteTotals(breakdown);
    expect(totals.totalHtCents).toBe(12000);
    // MO (9000 c, taux 10 %) + Colle (3000 c, taux 20 %) : 900 + 600, pas 600 + 600.
    expect(totals.totalVatCents).toBe(900 + 600);
    expect(totals.totalTtcCents).toBe(13500);
  });
});

describe("buildQuotePdfTableLines — main-d'oeuvre jamais perdue", () => {
  const base = { materials: [], laborRatePerHourCents: 4000, defaultVatRate: 20 };

  it("prestations sans durée : une ligne de main-d'oeuvre au lieu de rien", () => {
    const lines = buildQuotePdfTableLines({
      ...base,
      services: [{ service_title: "Rénovation SDB", duration_minutes: 0, line_total: null, unit_price: null }],
      laborTotalCents: 240000,
      laborDurationMinutes: 3600,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ designation: "Rénovation SDB", quantity: 60, lineTotalCents: 240000 });
  });

  it("durée facturée ≠ somme des prestations : les lignes totalisent labor_total", () => {
    const lines = buildQuotePdfTableLines({
      ...base,
      services: [
        { service_title: "A", duration_minutes: 60, line_total: null, unit_price: null },
        { service_title: "B", duration_minutes: 60, line_total: null, unit_price: null },
      ],
      laborTotalCents: 16000,
      laborDurationMinutes: 240,
    });
    expect(lines.reduce((s, l) => s + l.lineTotalCents, 0)).toBe(16000);
    expect(lines.map((l) => l.quantity)).toEqual([2, 2]);
  });

  it("arrondis : la somme reste exacte au centime", () => {
    const lines = buildQuotePdfTableLines({
      ...base,
      services: [
        { service_title: "A", duration_minutes: 1, line_total: null, unit_price: null },
        { service_title: "B", duration_minutes: 1, line_total: null, unit_price: null },
        { service_title: "C", duration_minutes: 1, line_total: null, unit_price: null },
      ],
      laborTotalCents: 1000,
      laborDurationMinutes: 3,
    });
    expect(lines.reduce((s, l) => s + l.lineTotalCents, 0)).toBe(1000);
  });
});
