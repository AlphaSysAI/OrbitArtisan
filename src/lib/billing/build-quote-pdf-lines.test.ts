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
