import { describe, expect, it } from "vitest";

import { computeQuoteMarginPreview } from "@/lib/billing/quote-margin";
import {
  computeDepositAmountCents,
  computeProgressInvoiceAmountCents,
  computeRemainingBillableCents,
} from "@/lib/billing/invoice-types";

describe("computeQuoteMarginPreview", () => {
  it("calcule la marge brute", () => {
    const r = computeQuoteMarginPreview({
      grandTotalCents: 100000,
      laborTotalCents: 60000,
      materialsTotalCents: 40000,
    });
    expect(r.estimatedMaterialCostCents).toBe(26000);
    expect(r.estimatedLaborCostCents).toBe(39000);
    expect(r.grossMarginCents).toBe(35000);
  });
});

describe("BTP invoice amounts", () => {
  it("calcule le reste à facturer", () => {
    expect(computeRemainingBillableCents(100000, 30000)).toBe(70000);
  });

  it("calcule acompte et situation", () => {
    expect(computeDepositAmountCents(100000, 30)).toBe(30000);
    expect(computeProgressInvoiceAmountCents(100000, 60, 30000)).toBe(30000);
  });
});
