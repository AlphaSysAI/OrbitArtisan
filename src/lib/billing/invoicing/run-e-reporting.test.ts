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
  it("ne lit ni ne consomme une file réelle en mode simulation", async () => {
    vi.stubEnv("E_REPORTING_PROVIDER", "noop");
    try {
      const { runEReportingSubmission } = await import("./run-e-reporting");
      const from = vi.fn(() => { throw new Error("La file ne doit pas être consommée"); });
      const result = await runEReportingSubmission({ from } as never);
      expect(result).toMatchObject({ submittedTransactions: 0, processedGroups: 0, skippedNoop: true });
      expect(from).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
