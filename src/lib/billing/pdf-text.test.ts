import { describe, expect, it } from "vitest";

import { renderInvoicePdf } from "@/lib/billing/facturx/render-invoice-pdf";

import { formatEurosForPdf, sanitizePdfText } from "./pdf-text";

describe("sanitizePdfText", () => {
  it("convertit l'espace fine insécable produite par Intl", () => {
    const raw = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(1200);
    expect(raw).toContain("\u202F");
    expect(sanitizePdfText(raw)).not.toContain("\u202F");
  });

  it("préserve les caractères encodables en WinAnsi", () => {
    expect(sanitizePdfText("Maçonnerie · œuvre — 20 % — €")).toBe("Maçonnerie · œuvre — 20 % — €");
  });

  it("remplace les caractères hors WinAnsi sans lever d'erreur", () => {
    expect(sanitizePdfText("Chantier ✅ 日本")).toBe("Chantier ? ??");
  });

  it("supprime les caractères invisibles", () => {
    expect(sanitizePdfText("A\u200BB\uFEFFC")).toBe("ABC");
  });
});

describe("formatEurosForPdf", () => {
  it("formate les milliers sans caractère non encodable", () => {
    const formatted = formatEurosForPdf(123_456);
    // L'espace insécable U+00A0 avant « € » fait partie de WinAnsi : conservée.
    expect(formatted).toBe("1 234,56\u00A0€");
    expect(formatted).not.toContain("\u202F");
  });
});

describe("régression : PDF avec montants à quatre chiffres", () => {
  it("génère une facture de 1 200 € sans erreur d'encodage", async () => {
    const pdf = await renderInvoicePdf({
      invoiceNumber: "FAC-2026-001",
      issueDate: new Date("2026-01-15T00:00:00.000Z"),
      seller: { name: "Soline BTP", siret: "12345678901234" },
      buyer: { name: "Client Pro" },
      lines: [
        {
          lineNumber: 1,
          label: "Réfection complète de la toiture",
          quantity: 1,
          lineTotalCents: 120_000,
          vatRate: 20,
          vatCategoryCode: "S",
        },
      ],
      legalMentions: ["SIRET 12345678901234 · TVA FR12345678901"],
    });

    expect(Buffer.from(pdf.slice(0, 4)).toString("utf8")).toBe("%PDF");
  });
});
