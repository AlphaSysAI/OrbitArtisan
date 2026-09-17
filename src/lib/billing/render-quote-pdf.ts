import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { formatDateForPdf, formatEurosForPdf } from "@/lib/billing/pdf-text";
import {
  PDF_BRAND,
  PDF_MARGIN,
  PDF_MUTED,
  PDF_PAGE_HEIGHT,
  PDF_PAGE_WIDTH,
  PDF_TABLE_COLS,
  PdfLayoutWriter,
  wrapPdfText,
  type PdfFonts,
} from "@/lib/billing/pdf-layout";
import type { QuotePdfDocument, QuotePdfTableLine } from "@/lib/billing/quote-pdf-types";

export type { QuotePdfDocument } from "@/lib/billing/quote-pdf-types";

async function embedLogo(pdf: PDFDocument, bytes: Uint8Array | null | undefined) {
  if (!bytes?.length) return null;
  try {
    if (bytes[0] === 0x89) return pdf.embedPng(bytes);
    return pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

function drawTableLine(page: import("pdf-lib").PDFPage, fonts: PdfFonts, line: QuotePdfTableLine, y: number): number {
  const designationLines = wrapPdfText(line.designation, 42);
  for (let i = 0; i < designationLines.length; i++) {
    page.drawText(designationLines[i]!, {
      x: PDF_TABLE_COLS.designation.x,
      y: y - i * 12,
      size: 9,
      font: i === 0 ? fonts.bold : fonts.regular,
      color: rgb(0.12, 0.12, 0.12),
    });
  }
  if (line.detail) {
    page.drawText(line.detail, {
      x: PDF_TABLE_COLS.designation.x,
      y: y - designationLines.length * 12 - 2,
      size: 8,
      font: fonts.regular,
      color: PDF_MUTED,
    });
  }

  const blockHeight = designationLines.length * 12 + (line.detail ? 12 : 0);
  page.drawText(`${line.quantity} ${line.quantityLabel}`, {
    x: PDF_TABLE_COLS.qty.x,
    y,
    size: 9,
    font: fonts.regular,
    color: rgb(0.12, 0.12, 0.12),
  });
  page.drawText(formatEurosForPdf(line.unitPriceCents), {
    x: PDF_TABLE_COLS.unit.x,
    y,
    size: 9,
    font: fonts.regular,
    color: rgb(0.12, 0.12, 0.12),
  });
  page.drawText(`${line.vatRate} %`, {
    x: PDF_TABLE_COLS.vat.x,
    y,
    size: 9,
    font: fonts.regular,
    color: rgb(0.12, 0.12, 0.12),
  });
  page.drawText(formatEurosForPdf(line.lineTotalCents), {
    x: PDF_TABLE_COLS.total.x,
    y,
    size: 9,
    font: fonts.bold,
    color: rgb(0.12, 0.12, 0.12),
  });

  return y - blockHeight - 8;
}

export async function renderQuotePdf(doc: QuotePdfDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts: PdfFonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const writer = new PdfLayoutWriter(pdf, fonts);

  const logo = await embedLogo(pdf, doc.seller.logoBytes);
  const headerTop = PDF_PAGE_HEIGHT - PDF_MARGIN;

  if (logo) {
    const dims = logo.scale(0.18);
    writer.getPage().drawImage(logo, {
      x: PDF_PAGE_WIDTH - PDF_MARGIN - dims.width,
      y: headerTop - dims.height + 4,
      width: dims.width,
      height: dims.height,
    });
  }

  writer.getPage().drawRectangle({
    x: 0,
    y: PDF_PAGE_HEIGHT - 28,
    width: PDF_PAGE_WIDTH,
    height: 28,
    color: PDF_BRAND,
  });
  writer.getPage().drawText("DEVIS", {
    x: PDF_MARGIN,
    y: PDF_PAGE_HEIGHT - 20,
    size: 14,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });
  writer.getPage().drawText(`N° ${doc.quoteNumber}`, {
    x: PDF_MARGIN + 72,
    y: PDF_PAGE_HEIGHT - 20,
    size: 11,
    font: fonts.regular,
    color: rgb(1, 1, 1),
  });

  writer.setY(headerTop - 36);
  writer.drawText(`Date d'émission : ${formatDateForPdf(doc.issueDate)}`, { size: 9 });
  writer.drawText(`Valable jusqu'au : ${formatDateForPdf(doc.validUntil)}`, { size: 9, color: PDF_MUTED });
  writer.drawRule();

  const colMid = PDF_PAGE_WIDTH / 2 + 10;
  const blockStartY = writer.currentY;

  writer.drawText("ÉMETTEUR", { size: 8, bold: true, color: PDF_BRAND });
  writer.drawText(doc.seller.business_name, { size: 10, bold: true });
  if (doc.seller.name) writer.drawText(doc.seller.name, { size: 9 });
  if (doc.seller.addressLine1) writer.drawText(doc.seller.addressLine1, { size: 9 });
  if (doc.seller.postalCode || doc.seller.city) {
    writer.drawText([doc.seller.postalCode, doc.seller.city].filter(Boolean).join(" "), { size: 9 });
  }
  if (doc.seller.phone) writer.drawText(`Tél. ${doc.seller.phone}`, { size: 9 });
  if (doc.seller.email) writer.drawText(doc.seller.email, { size: 9 });
  if (doc.seller.siret) writer.drawText(`SIRET ${doc.seller.siret}`, { size: 8, color: PDF_MUTED });

  const emitterBottom = writer.currentY;
  writer.setY(blockStartY);

  writer.drawText("CLIENT", { x: colMid, size: 8, bold: true, color: PDF_BRAND });
  writer.drawText(doc.buyer.name, { x: colMid, size: 10, bold: true });
  if (doc.buyer.addressLine1) writer.drawText(doc.buyer.addressLine1, { x: colMid, size: 9 });
  if (doc.buyer.postalCode || doc.buyer.city) {
    writer.drawText([doc.buyer.postalCode, doc.buyer.city].filter(Boolean).join(" "), {
      x: colMid,
      size: 9,
    });
  }
  if (doc.buyer.email) writer.drawText(doc.buyer.email, { x: colMid, size: 9, color: PDF_MUTED });

  writer.setY(Math.min(emitterBottom, writer.currentY) - 12);

  if (doc.workSiteAddress?.trim()) {
    writer.drawText("LIEU D'EXÉCUTION DES TRAVAUX", { size: 8, bold: true, color: PDF_BRAND });
    writer.drawText(doc.workSiteAddress.trim(), { size: 9, maxWidthChars: 90 });
    writer.drawRule();
  }

  writer.drawText("DÉTAIL DES PRESTATIONS ET FOURNITURES", { size: 9, bold: true, color: PDF_BRAND });
  writer.drawTableHeader([
    { label: "Désignation", x: PDF_TABLE_COLS.designation.x, width: PDF_TABLE_COLS.designation.width },
    { label: "Qté", x: PDF_TABLE_COLS.qty.x, width: PDF_TABLE_COLS.qty.width },
    { label: "PU HT", x: PDF_TABLE_COLS.unit.x, width: PDF_TABLE_COLS.unit.width },
    { label: "TVA", x: PDF_TABLE_COLS.vat.x, width: PDF_TABLE_COLS.vat.width },
    { label: "Total HT", x: PDF_TABLE_COLS.total.x, width: PDF_TABLE_COLS.total.width },
  ]);

  for (const line of doc.tableLines) {
    writer.ensureSpace(150);
    const newY = drawTableLine(writer.getPage(), fonts, line, writer.currentY);
    writer.setY(newY);
  }

  writer.drawRule();
  writer.ensureSpace(180);

  const totalsX = PDF_PAGE_WIDTH - PDF_MARGIN - 200;
  for (const row of doc.vatBreakdown) {
    writer.drawText(`Base HT ${row.rate} % : ${formatEurosForPdf(row.baseHtCents)}`, {
      x: totalsX,
      size: 9,
    });
    writer.drawText(`TVA ${row.rate} % : ${formatEurosForPdf(row.vatCents)}`, { x: totalsX, size: 9 });
  }

  writer.drawText(`Total HT : ${formatEurosForPdf(doc.totalHtCents)}`, { x: totalsX, size: 10, bold: true });
  writer.drawText(`Total TVA : ${formatEurosForPdf(doc.totalVatCents)}`, { x: totalsX, size: 10 });
  writer.drawText(`Total TTC : ${formatEurosForPdf(doc.totalTtcCents)}`, {
    x: totalsX,
    size: 12,
    bold: true,
    color: PDF_BRAND,
  });

  if (doc.notes?.trim()) {
    writer.drawRule();
    writer.drawText("OBSERVATIONS", { size: 8, bold: true, color: PDF_BRAND });
    writer.drawText(doc.notes.trim(), { size: 9, maxWidthChars: 95 });
  }

  writer.ensureSpace(200);
  writer.drawRule();
  writer.drawText("BON POUR ACCORD", { size: 10, bold: true, color: PDF_BRAND });
  writer.drawText(
    "Lu et approuvé, devis reçu avant exécution des travaux — Date : ____ / ____ / ______",
    { size: 9, maxWidthChars: 95 },
  );
  writer.drawText("Nom et signature du client :", { size: 9 });
  writer.drawText("_".repeat(55), { size: 9, color: PDF_MUTED });

  writer.ensureSpace(200);
  writer.drawRule();
  writer.drawText(doc.retractionNotice.heading, { size: 9, bold: true, color: PDF_BRAND });
  for (const line of doc.retractionNotice.body) {
    writer.ensureSpace(90);
    writer.drawText(line, { size: 8, maxWidthChars: 100, lineGap: 11 });
  }

  for (const warning of doc.legalWarnings) {
    writer.ensureSpace(90);
    writer.drawText(warning, { size: 7, color: rgb(0.55, 0.35, 0.1), maxWidthChars: 110 });
  }

  for (const line of doc.legalFooterLines) {
    writer.ensureSpace(90);
    writer.drawText(line, { size: 7, color: PDF_MUTED, maxWidthChars: 110, lineGap: 9 });
  }

  pdf.setTitle(`Devis ${doc.quoteNumber}`);
  pdf.setAuthor(doc.seller.business_name);
  pdf.setCreator("Soline");
  pdf.setCreationDate(doc.issueDate);

  return pdf.save();
}
