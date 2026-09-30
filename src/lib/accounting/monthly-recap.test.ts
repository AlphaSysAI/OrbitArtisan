import { describe, expect, it } from "vitest";

import { artisanRecapMessage, buildMonthlyRecap, recapCsv } from "./monthly-recap";

const inv = (id: string, type: string, lines: [number, number][], extra: Partial<{ status: string; dueDate: string; paymentReceivedAt: string }> = {}) => ({
  id,
  invoiceNumber: id,
  invoiceType: type,
  status: extra.status ?? "sent",
  dueDate: extra.dueDate ?? "2026-10-30",
  paymentReceivedAt: extra.paymentReceivedAt ?? null,
  lines: lines.map(([lineTotalCents, vatRate]) => ({ lineTotalCents, vatRate })),
});

describe("récap comptable mensuel", () => {
  const recap = buildMonthlyRecap({
    invoices: [
      inv("F1", "standard", [[100000, 10], [20000, 20]], { status: "paid" }),
      inv("F2", "deposit", [[50000, 10]], { dueDate: "2026-09-10" }),
      inv("A1", "credit_note", [[10000, 10]]),
    ],
    remindersSent: 0,
    piecesCount: 3,
    today: "2026-09-30",
  });

  it("ventile la TVA par taux, avoirs en négatif", () => {
    expect(recap.totalHtCents).toBe(100000 + 20000 + 50000 - 10000);
    expect(recap.vatByRate).toEqual([
      { rate: 20, baseCents: 20000, vatCents: 4000 },
      { rate: 10, baseCents: 140000, vatCents: 14000 },
    ]);
    expect(recap.totalTtcCents).toBe(160000 + 18000);
  });

  it("encaissements et échéances (hors avoirs)", () => {
    expect(recap).toMatchObject({ paidCount: 1, unpaidCount: 1, overdueCount: 1 });
  });

  it("message artisan chiffré", () => {
    expect(artisanRecapMessage(recap, "septembre 2026").replace(/\s/g, " ")).toBe(
      "Dossier de septembre transmis à ton comptable : 3 factures (1 600,00 € HT), 3 justificatifs, 0 relance nécessaire. 1 facture en retard à surveiller.",
    );
  });

  it("CSV de synthèse protégé (point-virgule, pas de formule)", () => {
    const csv = recapCsv(recap, "septembre 2026");
    expect(csv).toContain("Taux TVA;Base HT (centimes);TVA (centimes)");
    expect(csv).toContain("20 %;20000;4000");
  });
});
