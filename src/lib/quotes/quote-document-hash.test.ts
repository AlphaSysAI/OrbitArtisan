import { describe, expect, it } from "vitest";

import { computeQuoteDocumentHash, type QuoteHashInput } from "./quote-document-hash";

const base: QuoteHashInput = {
  quote: {
    id: "q1",
    quote_number: "DEV-1",
    grand_total: 10000,
    labor_total: 6000,
    materials_total: 4000,
    reduced_vat_rate: 10,
    valid_until: "2026-12-31",
    sent_at: "2026-09-30T10:00:00Z",
  },
  services: [{ service_title: "Pose", duration_minutes: 60, unit_price: 6000, line_total: 6000 }],
  materials: [{ label: "Tube", quantity: 2, unit_price: 2000, line_total: 4000, vat_rate: 10, exclude_from_invoice: false }],
};

describe("computeQuoteDocumentHash", () => {
  it("stable pour un même contenu", () => {
    expect(computeQuoteDocumentHash(base)).toBe(computeQuoteDocumentHash(structuredClone(base)));
    expect(computeQuoteDocumentHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("change si un montant change d'un centime", () => {
    const other = structuredClone(base);
    other.materials[0]!.line_total = 4001;
    expect(computeQuoteDocumentHash(other)).not.toBe(computeQuoteDocumentHash(base));
  });
});
