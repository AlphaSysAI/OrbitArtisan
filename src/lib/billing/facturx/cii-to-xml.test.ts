import { describe, expect, it } from "vitest";
import { Profile, validateXsd } from "@stackforge-eu/factur-x";

import { buildCrossIndustryInvoice } from "./build-cii-invoice";
import { crossIndustryInvoiceToXml } from "./cii-to-xml";
import type { FacturXInvoiceDocument } from "./types";

const sample: FacturXInvoiceDocument = {
  invoiceNumber: "FAC-TEST-001",
  issueDate: new Date("2026-01-15T12:00:00.000Z"),
  seller: {
    name: "Artisan Test",
    siret: "12345678901234",
    vatNumber: "FR12123456789",
    addressLine1: "1 rue Test",
    postalCode: "75001",
    city: "Paris",
    countryCode: "FR",
    email: "a@test.fr",
  },
  buyer: {
    name: "Client Test",
    siret: "98765432109876",
    vatNumber: "FR32987654321",
    addressLine1: "2 avenue Test",
    postalCode: "69001",
    city: "Lyon",
    countryCode: "FR",
  },
  lines: [
    {
      lineNumber: 1,
      label: "Prestation",
      quantity: 1,
      lineTotalCents: 10000,
      vatRate: 20,
      vatCategoryCode: "S",
    },
  ],
};

const multiVatSample: FacturXInvoiceDocument = {
  ...sample,
  invoiceNumber: "FAC-2026-0042",
  lines: [
    {
      lineNumber: 1,
      label: "Dépannage fuite cuisine",
      quantity: 1,
      lineTotalCents: 18000,
      vatRate: 10,
      vatCategoryCode: "S",
    },
    {
      lineNumber: 2,
      label: "Joint et raccords",
      quantity: 1,
      lineTotalCents: 4500,
      vatRate: 20,
      vatCategoryCode: "S",
    },
  ],
  notes: "Paiement à 30 jours.",
};

describe("crossIndustryInvoiceToXml", () => {
  it("produit un XML valide sans libxmljs", async () => {
    const cii = buildCrossIndustryInvoice(sample, "en16931");
    const xml = crossIndustryInvoiceToXml(cii);

    expect(xml).toContain("CrossIndustryInvoice");
    expect(xml).toContain("FAC-TEST-001");

    const validation = await validateXsd(xml, Profile.EN16931);
    expect(validation.valid).toBe(true);
  });

  it("accepte les caractères français dans les libellés", async () => {
    const cii = buildCrossIndustryInvoice(
      {
        ...multiVatSample,
        lines: [
          {
            lineNumber: 1,
            label: "Dépannage fuite cuisine — main d'œuvre",
            quantity: 1,
            lineTotalCents: 18000,
            vatRate: 10,
            vatCategoryCode: "S",
          },
        ],
      },
      "en16931",
    );
    const validation = await validateXsd(crossIndustryInvoiceToXml(cii), Profile.EN16931);
    expect(validation.valid).toBe(true);
  });

  it("valide une facture multi-TVA EN16931", async () => {
    const cii = buildCrossIndustryInvoice(multiVatSample, "en16931");
    const xml = crossIndustryInvoiceToXml(cii);
    const validation = await validateXsd(xml, Profile.EN16931);
    expect(validation.valid, validation.errors?.map((e) => e.message).join("\n")).toBe(true);
  });
});
