import { describe, expect, it } from "vitest";
import { Profile, validateXsd } from "@stackforge-eu/factur-x";
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
  it("sérialise le sample de test en XML XSD-valide", async () => {
    const { buildCrossIndustryInvoice } = await import("./build-cii-invoice");
    const { crossIndustryInvoiceToXml } = await import("./cii-to-xml");
    const { validateFacturXXml } = await import("./validate-factur-x");
    const xml = crossIndustryInvoiceToXml(buildCrossIndustryInvoice(sampleInvoice, "en16931"));
    const validation = await validateXsd(xml, Profile.EN16931);
    expect(validation.valid, validation.errors?.map((e) => e.message).join("\n")).toBe(true);
    await expect(validateFacturXXml(xml, "en16931")).resolves.toBeUndefined();
  });

  it(
    "génère un PDF/A-3 avec XML CII embarqué valide XSD (profil EN16931)",
    async () => {
      const result = await generateFacturX(sampleInvoice, { profile: "en16931" });

      expect(result.filename).toBe(FACTURX_XML_FILENAME);
      expect(result.xml).toContain("CrossIndustryInvoice");
      expect(result.xml).toContain(sampleInvoice.invoiceNumber);
      expect(result.pdf.byteLength).toBeGreaterThan(1000);

      const validation = await validateXsd(result.xml, Profile.EN16931);
      expect(validation.valid).toBe(true);
    },
    30_000,
  );

  it(
    "génère aussi un profil BASIC valide XSD",
    async () => {
      const result = await generateFacturX(sampleInvoice, { profile: "basic" });
      const validation = await validateXsd(result.xml, Profile.BASIC);
      expect(validation.valid).toBe(true);
    },
    30_000,
  );

  it(
    "permet l'extraction du XML embarqué (dev — stafyniaksacha optionnel)",
    async () => {
      const result = await generateFacturX(sampleInvoice, { profile: "en16931" });
      let extract: (options: { pdf: Buffer; check?: boolean }) => Promise<{ xml: string; filename: string }>;

      try {
        ({ extract } = await import("@stafyniaksacha/facturx"));
      } catch {
        return;
      }

      const extracted = await extract({ pdf: Buffer.from(result.pdf), check: false });
      expect(extracted.filename).toBe(FACTURX_XML_FILENAME);
      expect(extracted.xml).toContain(sampleInvoice.invoiceNumber);
    },
    30_000,
  );
});
