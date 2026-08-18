import { computeDebourseSec } from "@/lib/work-library/pricing";
import { describe, expect, it } from "vitest";

import { parseWorkItemsCsv } from "@/lib/work-library/csv";
import {
  computeLaborCostFromHours,
  computeMarginPercent,
  computeSellingPriceFromMargin,
} from "@/lib/work-library/pricing";

describe("work library pricing", () => {
  it("calcule le déboursé sec", () => {
    expect(computeDebourseSec(40, 60)).toBe(100);
  });

  it("calcule le PV depuis la marge cible", () => {
    expect(computeSellingPriceFromMargin(100, 30)).toBeCloseTo(142.86, 1);
  });

  it("calcule la marge implicite", () => {
    expect(computeMarginPercent(100, 125)).toBe(20);
  });

  it("calcule le coût MO depuis les heures", () => {
    expect(computeLaborCostFromHours(2, 45)).toBe(90);
  });
});

describe("parseWorkItemsCsv", () => {
  it("parse un CSV avec en-têtes", () => {
    const csv = `reference;title;description;category;unit;unit_price_ht;default_vat_rate;labor_cost;material_cost;estimated_hours
REF-1;Pose carrelage;Sol;Carrelage;m²;45;10;30;10;1.5`;
    const { rows, errors } = parseWorkItemsCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("Pose carrelage");
    expect(rows[0]?.unit_price_ht).toBe(45);
  });
});
