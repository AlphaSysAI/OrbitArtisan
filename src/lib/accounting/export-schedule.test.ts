import { describe, expect, it } from "vitest";

import { buildInvoicesCsv } from "./invoices-csv";
import {
  accountingActionForDay,
  batchBySize,
  buildAccountingUploadPath,
  displayNameFromStorageName,
  jpegFilename,
  parisDay,
  previousPeriodKey,
  sanitizeAccountingFilename,
  scaledImageSize,
} from "./export-schedule";

describe("calendrier de l'envoi comptable", () => {
  it("calcule le jour à Paris (fin de mois UTC = début de mois à Paris)", () => {
    expect(parisDay(new Date("2026-09-30T22:30:00.000Z"))).toEqual({ year: 2026, month: 10, day: 1, lastDay: 31 });
  });

  it("préavis 48 h avant le dernier jour, envoi le dernier jour", () => {
    expect(accountingActionForDay({ year: 2026, month: 10, day: 29, lastDay: 31 })).toBe("notice");
    expect(accountingActionForDay({ year: 2026, month: 10, day: 31, lastDay: 31 })).toBe("send");
    expect(accountingActionForDay({ year: 2026, month: 10, day: 30, lastDay: 31 })).toBeNull();
    expect(accountingActionForDay({ year: 2026, month: 2, day: 26, lastDay: 28 })).toBe("notice");
  });

  it("période précédente, y compris en janvier", () => {
    expect(previousPeriodKey(2027, 1)).toBe("2026-12-01");
    expect(previousPeriodKey(2026, 10)).toBe("2026-09-01");
  });
});

describe("noms de fichiers", () => {
  it("nettoie les noms et retrouve le nom lisible", () => {
    expect(sanitizeAccountingFilename("Ticket CB Brico Dépôt (1).jpg")).toBe("Ticket_CB_Brico_Depot_1_.jpg");
    const path = buildAccountingUploadPath("p1", "facture achat.pdf", 1700000000000, "ab12cd");
    expect(path).toBe("p1/1700000000000-ab12cd-facture_achat.pdf");
    expect(displayNameFromStorageName(path)).toBe("facture_achat.pdf");
  });
});

describe("batchBySize", () => {
  it("découpe sous la limite, dans l'ordre", () => {
    const items = [{ size: 10 }, { size: 10 }, { size: 15 }, { size: 40 }, { size: 5 }];
    expect(batchBySize(items, 30).map((b) => b.map((i) => i.size))).toEqual([[10, 10], [15], [40], [5]]);
  });
});

describe("buildInvoicesCsv", () => {
  it("échappe les virgules et guillemets, BOM en tête", () => {
    const csv = buildInvoicesCsv([
      {
        invoice_number: "F-2026-001",
        invoice_type: "standard",
        status: "paid",
        finalized_at: "2026-10-05T10:00:00Z",
        due_date: "2026-11-04",
        customer_name: 'Dupont, "Jean"',
        customer_email: null,
        grand_total: 120000,
        labor_total: 80000,
        materials_total: 40000,
        payment_received_at: "2026-10-20T08:00:00Z",
      },
    ]);
    expect(csv.startsWith("﻿Numero,")).toBe(true);
    expect(csv).toContain('"Dupont, ""Jean"""');
    expect(csv).toContain(",2026-10-20");
  });
});

describe("réduction des photos", () => {
  it("ramène le plus grand côté à 2000 px sans déformer, jamais d'agrandissement", () => {
    expect(scaledImageSize(4032, 3024)).toEqual({ width: 2000, height: 1500 });
    expect(scaledImageSize(3024, 4032)).toEqual({ width: 1500, height: 2000 });
    expect(scaledImageSize(1200, 900)).toEqual({ width: 1200, height: 900 });
  });

  it("renomme en .jpg", () => {
    expect(jpegFilename("IMG_0421.HEIC")).toBe("IMG_0421.jpg");
    expect(jpegFilename("ticket")).toBe("ticket.jpg");
  });
});
