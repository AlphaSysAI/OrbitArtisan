import { describe, expect, it, vi } from "vitest";

import { buildEReportingBatchPayload, groupEReportingQueueRows, type EReportingPayload } from "./e-reporting";

const samplePayload = (invoiceId: string): EReportingPayload => ({
  schemaVersion: "1.0",
  invoiceId,
  invoiceNumber: `FAC-${invoiceId}`,
  issueDate: "2026-08-01T00:00:00.000Z",
  currency: "EUR",
  seller: { name: "Artisan", siret: null, siren: null, vatNumber: null, countryCode: "FR" },
  buyer: { name: "Client", email: null, countryCode: "FR" },
  totals: { lineTotalCents: 10000, taxTotalCents: 2000, grandTotalCents: 12000 },
  vatBreakdown: [{ rate: 20, basisCents: 10000, taxCents: 2000, categoryCode: "S" }],
  operationType: "prestation_services",
  vatCollectionNature: "on_delivery",
});

describe("e-reporting batching", () => {
  it("regroupe par artisan et période", () => {
    const groups = groupEReportingQueueRows([
      { id: "1", artisan_id: "a1", reporting_period: "2026-08-01", payload: samplePayload("i1") },
      { id: "2", artisan_id: "a1", reporting_period: "2026-08-01", payload: samplePayload("i2") },
      { id: "3", artisan_id: "a2", reporting_period: "2026-08-01", payload: samplePayload("i3") },
    ]);

    expect(groups.size).toBe(2);
    expect(groups.get("a1:2026-08-01")?.rows).toHaveLength(2);
  });

  it("construit un lot version 1.1", () => {
    const batch = buildEReportingBatchPayload("a1", "2026-08-01", [samplePayload("i1")]);
    expect(batch.schemaVersion).toBe("1.1");
    expect(batch.transactionCount).toBe(1);
    expect(batch.artisanId).toBe("a1");
  });
});

describe("runEReportingSubmission noop", () => {
  it("retourne zéro si file vide", async () => {
    vi.stubEnv("E_REPORTING_PROVIDER", "noop");
    const { runEReportingSubmission } = await import("./run-e-reporting");

    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
        })),
      })),
    };

    const result = await runEReportingSubmission(supabase as never);
    expect(result.submittedTransactions).toBe(0);
    expect(result.processedGroups).toBe(0);
  });
});
