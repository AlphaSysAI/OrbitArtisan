import { randomBytes } from "node:crypto";

import { AFRelationship, PDFDocument, PDFHexString, PDFName } from "pdf-lib";

import { FacturXValidationError } from "./types";
import type { FacturXProfile } from "./types";

export const FACTURX_XML_FILENAME = "factur-x.xml" as const;

const CONFORMANCE_LEVEL: Record<FacturXProfile, string> = {
  basic: "BASIC",
  en16931: "EN 16931",
};

function formatPdfMetadataDate(date: Date): string {
  return `${date.toISOString().split(".")[0]}Z`;
}

/** Métadonnées XMP PDF/A-3b + extension Factur-X (aligné FNFE-MPE). */
function setPdfA3FacturXMetadata(
  pdf: PDFDocument,
  options: {
    documentId: string;
    filename: string;
    conformanceLevel: string;
    author: string;
    title: string;
    subject: string;
    date: Date;
    producer: string;
    creator: string;
  },
): void {
  const metadataXML = `
  <?xpacket begin="" id="${options.documentId}"?>
    <x:xmpmeta xmlns:x="adobe:ns:meta/">
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
        <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
          <pdfaid:part>3</pdfaid:part>
          <pdfaid:conformance>B</pdfaid:conformance>
        </rdf:Description>
        <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:creator>
            <rdf:Seq>
              <rdf:li>${escapeXml(options.author)}</rdf:li>
            </rdf:Seq>
          </dc:creator>
          <dc:title>
            <rdf:Alt>
              <rdf:li xml:lang="x-default">${escapeXml(options.title)}</rdf:li>
            </rdf:Alt>
          </dc:title>
          <dc:description>
            <rdf:Alt>
              <rdf:li xml:lang="x-default">${escapeXml(options.subject)}</rdf:li>
            </rdf:Alt>
          </dc:description>
        </rdf:Description>
        <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
          <pdf:Producer>${escapeXml(options.producer)}</pdf:Producer>
        </rdf:Description>
        <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
          <xmp:CreatorTool>${escapeXml(options.creator)}</xmp:CreatorTool>
          <xmp:CreateDate>${formatPdfMetadataDate(options.date)}</xmp:CreateDate>
          <xmp:ModifyDate>${formatPdfMetadataDate(options.date)}</xmp:ModifyDate>
          <xmp:MetadataDate>${formatPdfMetadataDate(options.date)}</xmp:MetadataDate>
        </rdf:Description>
        <rdf:Description xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#" rdf:about="">
          <fx:DocumentType>INVOICE</fx:DocumentType>
          <fx:DocumentFileName>${escapeXml(options.filename)}</fx:DocumentFileName>
          <fx:Version>1.0</fx:Version>
          <fx:ConformanceLevel>${escapeXml(options.conformanceLevel)}</fx:ConformanceLevel>
        </rdf:Description>
      </rdf:RDF>
    </x:xmpmeta>
  <?xpacket end="w"?>
  `.trim();

  const metadataStream = pdf.context.stream(metadataXML, {
    Type: PDFName.of("Metadata"),
    Subtype: PDFName.of("XML"),
    Length: metadataXML.length,
  });
  pdf.catalog.set(PDFName.of("Metadata"), pdf.context.register(metadataStream));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type EmbedFacturXOptions = {
  visualPdf: Uint8Array;
  xml: string;
  profile: FacturXProfile;
  meta: {
    author: string;
    title: string;
    subject: string;
    date: Date;
  };
  validateXml?: boolean;
  language?: string;
};

/**
 * Embarque le XML CII dans un PDF/A-3 avec la pièce jointe `factur-x.xml`
 * et la relation AF `/Alternative` (représentation machine lisible).
 */
export async function embedFacturXInPdf(options: EmbedFacturXOptions): Promise<Uint8Array> {
  if (options.validateXml !== false) {
    const { check } = await import("@stafyniaksacha/facturx");
    const result = await check({
      xml: options.xml,
      flavor: "facturx",
      level: options.profile,
    });

    if (!result.valid) {
      throw new FacturXValidationError("XML CII invalide (échec validation XSD Factur-X).", result.errors);
    }
  }

  const pdf = await PDFDocument.load(options.visualPdf);
  const documentId = randomBytes(16).toString("hex");
  const idHex = PDFHexString.of(documentId);
  pdf.context.trailerInfo.ID = pdf.context.obj([idHex, idHex]);

  const xmlBytes = new TextEncoder().encode(options.xml);
  await pdf.attach(xmlBytes, FACTURX_XML_FILENAME, {
    afRelationship: AFRelationship.Alternative,
    mimeType: "text/xml",
    creationDate: options.meta.date,
    modificationDate: options.meta.date,
    description: "Factur-X XML file",
  });

  if (options.language) {
    pdf.setLanguage(options.language);
  }

  pdf.setCreationDate(options.meta.date);
  pdf.setModificationDate(options.meta.date);
  pdf.setTitle(options.meta.title);
  pdf.setSubject(options.meta.subject);
  pdf.setAuthor(options.meta.author);
  pdf.setKeywords(["Invoice", "Factur-X"]);
  pdf.setCreator("OrbitArtisan");
  pdf.setProducer("OrbitArtisan Factur-X");

  setPdfA3FacturXMetadata(pdf, {
    documentId,
    filename: FACTURX_XML_FILENAME,
    conformanceLevel: CONFORMANCE_LEVEL[options.profile],
    author: options.meta.author,
    title: options.meta.title,
    subject: options.meta.subject,
    date: options.meta.date,
    producer: "OrbitArtisan Factur-X",
    creator: "OrbitArtisan",
  });

  return pdf.save();
}
