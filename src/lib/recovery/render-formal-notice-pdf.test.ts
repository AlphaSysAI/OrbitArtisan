import { describe, expect, it } from "vitest";

import {
  computeFormalNoticeAmounts,
  renderFormalNoticePdf,
  type FormalNoticeDocument,
} from "./render-formal-notice-pdf";

const baseDoc = (overrides: Partial<FormalNoticeDocument> = {}): FormalNoticeDocument => ({
  invoiceNumber: "FAC-2026-014",
  invoiceIssueDate: new Date("2026-05-01T00:00:00.000Z"),
  dueDate: new Date("2026-06-01T00:00:00.000Z"),
  amountDueCents: 120_000,
  noticeDate: new Date("2026-07-01T00:00:00.000Z"),
  isBusinessDebtor: true,
  creditor: {
    name: "Soline BTP",
    addressLine1: "12 rue des Artisans",
    postalCode: "33000",
    city: "Bordeaux",
    siret: "12345678901234",
  },
  debtor: {
    name: "Client Pro SARL",
    addressLine1: "8 avenue du Commerce",
    postalCode: "75011",
    city: "Paris",
    siren: "987654321",
  },
  ...overrides,
});

describe("computeFormalNoticeAmounts", () => {
  it("ajoute pénalités et indemnité de 40 € en B2B", () => {
    const amounts = computeFormalNoticeAmounts(baseDoc());

    expect(amounts.daysOverdue).toBe(30);
    expect(amounts.indemnityCents).toBe(4000);
    // 1 200 € × 12,15 % × 30/365 ≈ 11,98 €
    expect(amounts.penaltiesCents).toBe(1198);
    expect(amounts.totalCents).toBe(120_000 + 1198 + 4000);
  });

  it("n'applique ni pénalités ni indemnité forfaitaire en B2C", () => {
    const amounts = computeFormalNoticeAmounts(baseDoc({ isBusinessDebtor: false }));

    expect(amounts.penaltiesCents).toBe(0);
    expect(amounts.indemnityCents).toBe(0);
    expect(amounts.totalCents).toBe(120_000);
  });

  it("ne calcule aucune pénalité avant l'échéance", () => {
    const amounts = computeFormalNoticeAmounts(
      baseDoc({ noticeDate: new Date("2026-05-15T00:00:00.000Z") }),
    );

    expect(amounts.daysOverdue).toBe(0);
    expect(amounts.penaltiesCents).toBe(0);
    expect(amounts.totalCents).toBe(120_000);
  });
});

describe("renderFormalNoticePdf", () => {
  it("génère un PDF exploitable", async () => {
    const pdf = await renderFormalNoticePdf(baseDoc());

    expect(pdf.byteLength).toBeGreaterThan(1000);
    // En-tête de fichier PDF : « %PDF »
    expect(Buffer.from(pdf.slice(0, 4)).toString("utf8")).toBe("%PDF");
  });
});
