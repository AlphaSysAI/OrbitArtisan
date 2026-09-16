import { buildCrossIndustryInvoice } from "./build-cii-invoice";
import { crossIndustryInvoiceToXml } from "./cii-to-xml";
import { embedFacturXInPdf, FACTURX_XML_FILENAME } from "./embed-factur-x-pdf";
import { renderInvoicePdf } from "./render-invoice-pdf";
import type {
  FacturXGenerationOptions,
  FacturXGenerationResult,
  FacturXInvoiceDocument,
} from "./types";
import { invoiceTypeLabel } from "@/lib/billing/invoice-types";

/**
 * Génère une facture Factur-X complète :
 * 1. Modèle CII EN16931 / BASIC → XML
 * 2. PDF visuel standard
 * 3. PDF/A-3 avec XML embarqué (`factur-x.xml`, AFRelationship Alternative)
 */
export async function generateFacturX(
  document: FacturXInvoiceDocument,
  options: FacturXGenerationOptions = {},
): Promise<FacturXGenerationResult> {
  const profile = options.profile ?? "en16931";
  const validateXml = options.validateXml !== false;
  const language = options.language ?? "fr-FR";

  const cii = buildCrossIndustryInvoice(document, profile);
  const xml = crossIndustryInvoiceToXml(cii);

  const visualPdf = await renderInvoicePdf(document);

  // Point 1 audit pré-pilote : même correctif que renderInvoicePdf — le
  // PDF/A-3 final (avec XML Factur-X embarqué) ne doit pas non plus dire
  // "Facture" en dur pour un avoir.
  const docLabel = invoiceTypeLabel(document.invoiceType);
  const meta = {
    author: document.seller.name,
    title: `${document.seller.name}: ${docLabel} ${document.invoiceNumber}`,
    subject: `${docLabel} ${document.invoiceNumber} du ${formatShortDate(document.issueDate)}`,
    date: document.issueDate,
  };

  const pdf = await embedFacturXInPdf({
    visualPdf,
    xml,
    profile,
    meta,
    validateXml,
    language,
  });

  return {
    pdf,
    xml,
    profile,
    filename: FACTURX_XML_FILENAME,
  };
}

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR").format(date);
}

export { buildCrossIndustryInvoice } from "./build-cii-invoice";
export { embedFacturXInPdf, FACTURX_XML_FILENAME } from "./embed-factur-x-pdf";
export { renderInvoicePdf } from "./render-invoice-pdf";
export * from "./types";
