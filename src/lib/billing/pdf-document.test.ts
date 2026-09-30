import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { generateFacturX } from "@/lib/billing/facturx/generate-factur-x";
import { computeInvoicePdfTotals, renderInvoicePdf } from "@/lib/billing/facturx/render-invoice-pdf";
import type { FacturXInvoiceDocument } from "@/lib/billing/facturx/types";
import { resolvePdfTheme } from "@/lib/billing/pdf-document";
import { buildQuotePdfFooterLines, buildQuoteRetractionLines } from "@/lib/billing/quote-pdf-legal";
import { renderQuotePdf } from "@/lib/billing/render-quote-pdf";
import type { QuotePdfDocument } from "@/lib/billing/quote-pdf-types";

// Aperçu visuel : PDF_PREVIEW_DIR=/chemin npx vitest run src/lib/billing/pdf-document.test.ts
const previewDir = process.env.PDF_PREVIEW_DIR;
const logoPath = process.env.PDF_PREVIEW_LOGO;
const logoBytes = logoPath && existsSync(logoPath) ? new Uint8Array(readFileSync(logoPath)) : null;

const legal = {
  business_name: "Dupont Plomberie Chauffage",
  name: "Marc Dupont",
  siret: "12345678900012",
  siren: "123456789",
  vat_number: "FR12123456789",
  trade_register_number: "RM 123 456 789 Aude",
  decennale_insurer: "MAAF Pro",
  decennale_policy_number: "DEC-778899",
  rc_pro_insurer: "MAAF Pro",
  rc_pro_number: "RC-445566",
  mediator_name: "CM2C",
  mediator_url: "https://www.cm2c.net",
};

function quoteDoc(lines: number, accent: string | null): QuotePdfDocument {
  const validUntil = new Date("2026-12-30");
  return {
    quoteNumber: "DEV-2026-0137",
    issueDate: new Date("2026-09-30"),
    validUntil,
    paymentTermsDays: 30,
    defaultVatRate: 10,
    seller: {
      ...legal,
      addressLine1: "14 avenue du Général Leclerc",
      postalCode: "11000",
      city: "Carcassonne",
      phone: "06 12 34 56 78",
      logoBytes,
      accentColor: accent,
    },
    buyer: { name: "Mme Sophie Martin", email: "sophie.martin@example.fr" },
    tableLines: Array.from({ length: lines }, (_, i) => ({
      designation:
        i === 0
          ? "Remplacement chaudière gaz à condensation 25 kW, dépose et évacuation de l'ancien équipement, raccordements"
          : `Prestation ${i + 1} : fourniture et pose robinet thermostatique`,
      detail: i % 3 === 0 ? "Marque Saunier Duval, garantie 5 ans pièces" : undefined,
      quantity: i === 1 ? 1.5 : 1 + (i % 4),
      quantityLabel: i === 1 ? "h" : "u",
      unitPriceCents: 4500 + i * 1234,
      vatRate: i % 5 === 0 ? 5.5 : 10,
      lineTotalCents: (4500 + i * 1234) * (1 + (i % 4)),
    })),
    vatBreakdown: [
      { rate: 10, baseHtCents: 245000, vatCents: 24500 },
      { rate: 5.5, baseHtCents: 312000, vatCents: 17160 },
    ],
    totalHtCents: 557000,
    totalVatCents: 41660,
    totalTtcCents: 598660,
    notes: "Intervention prévue sous 3 semaines après acceptation. Accès au local chaufferie à prévoir.",
    workSiteAddress: "8 impasse des Lilas, 11000 Carcassonne",
    legalFooterLines: buildQuotePdfFooterLines({ profile: legal, validUntil, paymentTermsDays: 30 }),
    legalWarnings: [],
    retractionNotice: buildQuoteRetractionLines({ profile: legal, retractionWaived: false }),
    salesTermsLines: ["Article 1 — Les présentes conditions s'appliquent à toute prestation.", "Article 2 — Acompte de 30 % à la commande."],
    directPurchaseLines: [{ label: "Radiateur acier 1200 W", quantity: 2, unitPriceCents: 18900, lineTotalCents: 37800 }],
  };
}

function invoiceDoc(lines: number, type: FacturXInvoiceDocument["invoiceType"] = "standard"): FacturXInvoiceDocument {
  return {
    invoiceNumber: "FAC-2026-0088",
    issueDate: new Date("2026-09-30"),
    dueDate: new Date("2026-10-30"),
    paymentTermsDays: 30,
    invoiceType: type,
    seller: {
      name: legal.business_name,
      siret: legal.siret,
      vatNumber: legal.vat_number,
      addressLine1: "14 avenue du Général Leclerc",
      postalCode: "11000",
      city: "Carcassonne",
      phone: "06 12 34 56 78",
    },
    buyer: { name: "SCI Les Remparts", siret: "98765432100019", addressLine1: "2 rue Trivalle", postalCode: "11000", city: "Carcassonne", email: "gestion@remparts.fr" },
    lines: Array.from({ length: lines }, (_, i) => ({
      lineNumber: i + 1,
      label: i === 0 ? "Main d'œuvre plomberie — 6 h" : `Fourniture ${i + 1} : raccord cuivre Ø${12 + i}`,
      quantity: i === 0 ? 6 : 2,
      lineTotalCents: i === 0 ? 27000 : 1333 + i * 7,
      vatRate: i % 4 === 0 ? 20 : 10,
      vatCategoryCode: "S",
    })),
    notes: "Merci de votre confiance.",
    legalMentions: ["SIRET : 12345678900012", "Assurance décennale : MAAF Pro — n° DEC-778899 — couverture France métropolitaine"],
    branding: { logoBytes, accentColor: "#0284c7" },
  };
}

async function check(bytes: Uint8Array, name: string) {
  const pdf = await PDFDocument.load(bytes);
  if (previewDir) writeFileSync(path.join(previewDir, name), bytes);
  return pdf.getPageCount();
}

describe("gabarit devis / facture", () => {
  it("devis court tient sur une page, long devis multi-pages sans perte", async () => {
    expect(await check(await renderQuotePdf(quoteDoc(4, "#ea580c")), "devis-court.pdf")).toBeGreaterThanOrEqual(1);
    expect(await check(await renderQuotePdf(quoteDoc(45, null)), "devis-long.pdf")).toBeGreaterThan(1);
  });

  it("facture longue : plus de troncature des lignes (ancien bug y < 120)", async () => {
    expect(await check(await renderInvoicePdf(invoiceDoc(60)), "facture-longue.pdf")).toBeGreaterThan(1);
    await check(await renderInvoicePdf(invoiceDoc(5)), "facture.pdf");
    await check(await renderInvoicePdf(invoiceDoc(3, "credit_note")), "avoir.pdf");
  });

  it("PDF/A-3 : police Inter embarquée (aucune police standard) + OutputIntent sRGB", async () => {
    const { pdf: bytes } = await generateFacturX(invoiceDoc(5), { profile: "en16931", validateXml: false });
    if (previewDir) writeFileSync(path.join(previewDir, "facture-factur-x.pdf"), bytes);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.catalog.get(PDFName.of("OutputIntents"))).toBeDefined();
    const fonts: string[] = [];
    pdf.context.enumerateIndirectObjects().forEach(([, obj]) => {
      if (obj instanceof PDFDict && obj.get(PDFName.of("Type")) === PDFName.of("Font")) {
        fonts.push(String(obj.get(PDFName.of("BaseFont"))));
      }
    });
    expect(fonts.some((f) => f.includes("Inter"))).toBe(true);
    expect(fonts.some((f) => /Helvetica/.test(f))).toBe(false);
  });

  it("ventilation TVA identique au CII (arrondi par ligne, somme par taux)", () => {
    const t = computeInvoicePdfTotals([
      { lineNumber: 1, label: "a", quantity: 1, lineTotalCents: 1005, vatRate: 5.5, vatCategoryCode: "S" },
      { lineNumber: 2, label: "b", quantity: 1, lineTotalCents: 1005, vatRate: 5.5, vatCategoryCode: "S" },
      { lineNumber: 3, label: "c", quantity: 1, lineTotalCents: 999, vatRate: 20, vatCategoryCode: "S" },
    ]);
    // 1005 × 5,5 % = 55,275 → 55 par ligne → 110 (et non round(2010 × 5,5 %) = 111)
    expect(t.vatGroups.find((g) => g.rate === 5.5)?.taxCents).toBe(110);
    expect(t.totalHtCents).toBe(3009);
    expect(t.totalVatCents).toBe(110 + 200);
    expect(t.totalTtcCents).toBe(3319);
  });

  it("assombrit une couleur d'accent trop claire au lieu de l'ignorer", () => {
    const { accent } = resolvePdfTheme("#fde047");
    expect(accent.red).toBeLessThan(0.7);
    expect(accent.red).toBeGreaterThan(accent.blue);
  });

  it("franchise 293 B : devis et facture sans TVA, XML Factur-X catégorie E valide", async () => {
    const base = quoteDoc(3, null);
    const lines = base.tableLines.map((l) => ({ ...l, vatRate: 0 }));
    const ht = lines.reduce((s2, l) => s2 + l.lineTotalCents, 0);
    const quote = {
      ...base,
      tableLines: lines,
      vatBreakdown: [{ rate: 0, baseHtCents: ht, vatCents: 0 }],
      totalHtCents: ht,
      totalVatCents: 0,
      totalTtcCents: ht,
      vatFranchise: true,
    };
    expect(await check(await renderQuotePdf(quote), "devis-franchise.pdf")).toBeGreaterThanOrEqual(1);

    const inv = invoiceDoc(3);
    const franchiseInvoice = {
      ...inv,
      seller: { ...inv.seller, vatNumber: null },
      lines: inv.lines.map((l) => ({ ...l, vatRate: 0, vatCategoryCode: "E", vatExemptionReason: "TVA non applicable, art. 293 B du CGI" })),
    };
    await check(await renderInvoicePdf(franchiseInvoice), "facture-franchise.pdf");
    const totals = computeInvoicePdfTotals(franchiseInvoice.lines);
    expect(totals.totalVatCents).toBe(0);
    expect(totals.totalTtcCents).toBe(totals.totalHtCents);
    const { xml } = await generateFacturX(franchiseInvoice, { profile: "en16931" });
    expect(xml).toContain("<ram:CategoryCode>E</ram:CategoryCode>");
    expect(xml).toContain("TVA non applicable, art. 293 B du CGI");
  });
});
