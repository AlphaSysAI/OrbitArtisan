import { describe, expect, it } from "vitest";
import { check, extract } from "@stafyniaksacha/facturx";
import { Buffer } from "node:buffer";

import { generateFacturX } from "@/lib/billing/facturx/generate-factur-x";
import { FACTURX_XML_FILENAME } from "@/lib/billing/facturx/embed-factur-x-pdf";
import type { FacturXInvoiceDocument } from "@/lib/billing/facturx/types";

const sampleInvoice: FacturXInvoiceDocument = {
  invoiceNumber: "FAC-2026-0042",
  issueDate: new Date("2026-08-11T10:00:00.000Z"),
  seller: {
    name: "Plomberie Dupont SARL",
    siret: "12345678901234",
    siren: "123456789",
    vatNumber: "FR12123456789",
    nafCode: "43.22A",
    addressLine1: "12 rue des Artisans",
    postalCode: "69001",
    city: "Lyon",
    countryCode: "FR",
    tradeRegisterNumber: "RCS Lyon 123 456 789",
    email: "contact@plomberie-dupont.fr",
    phone: "+33 4 72 00 00 00",
  },
  buyer: {
    name: "Syndic Résidence Bellevue",
    siret: "98765432109876",
    siren: "987654321",
    vatNumber: "FR32987654321",
    addressLine1: "5 avenue de la République",
    postalCode: "69003",
    city: "Lyon",
    countryCode: "FR",
    email: "compta@bellevue.fr",
  },
  lines: [
    {
      lineNumber: 1,
      label: "Dépannage fuite cuisine — main d'œuvre",
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
  operationType: "prestation_services",
  vatCollectionNature: "on_delivery",
  vatOnDebits: false,
};

describe("generateFacturX", () => {
  it(
    "génère un PDF/A-3 avec XML CII embarqué extractible (profil EN16931)",
    async () => {
      const result = await generateFacturX(sampleInvoice, { profile: "en16931" });

      expect(result.filename).toBe(FACTURX_XML_FILENAME);
      expect(result.xml).toContain("CrossIndustryInvoice");
      expect(result.xml).toContain(sampleInvoice.invoiceNumber);
      expect(result.pdf.byteLength).toBeGreaterThan(1000);

      const extracted = await extract({ pdf: Buffer.from(result.pdf), check: false });
      expect(extracted.filename).toBe(FACTURX_XML_FILENAME);
      expect(extracted.flavor).toBe("facturx");
      expect(extracted.xml).toContain(sampleInvoice.invoiceNumber);
      expect(extracted.xml).toContain("Plomberie Dupont SARL");
      expect(extracted.xml).toContain("Syndic Résidence Bellevue");

      const validation = await check({
        xml: extracted.xml,
        flavor: "facturx",
        level: "en16931",
      });
      expect(validation.valid).toBe(true);
    },
    30_000,
  );

  it(
    "génère aussi un profil BASIC valide XSD",
    async () => {
      const result = await generateFacturX(sampleInvoice, { profile: "basic" });
      const validation = await check({ xml: result.xml, flavor: "facturx", level: "basic" });
      expect(validation.valid).toBe(true);
    },
    30_000,
  );
});
