import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { FacturXInvoiceDocument } from "./types";

const MARGIN = 50;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

function formatEuros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

/** Génère le PDF visuel standard (human-readable) avant embarquement Factur-X. */
export async function renderInvoicePdf(doc: FacturXInvoiceDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE_HEIGHT - MARGIN;

  const draw = (text: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    const size = opts.size ?? 10;
    const usedFont = opts.bold ? fontBold : font;
    page.drawText(text, {
      x: MARGIN,
      y,
      size,
      font: usedFont,
      color: opts.color ?? rgb(0.1, 0.1, 0.1),
    });
    y -= size + 6;
  };

  draw("FACTURE", { size: 20, bold: true });
  draw(`N° ${doc.invoiceNumber}`, { size: 12, bold: true });
  draw(`Date : ${formatDate(doc.issueDate)}`);
  y -= 8;

  draw("Émetteur", { size: 11, bold: true });
  draw(doc.seller.name, { bold: true });
  if (doc.seller.addressLine1) draw(doc.seller.addressLine1);
  if (doc.seller.postalCode || doc.seller.city) {
    draw([doc.seller.postalCode, doc.seller.city].filter(Boolean).join(" "));
  }
  if (doc.seller.vatNumber) draw(`TVA : ${doc.seller.vatNumber}`);
  if (doc.seller.siret) draw(`SIRET : ${doc.seller.siret}`);
  y -= 8;

  draw("Client", { size: 11, bold: true });
  draw(doc.buyer.name, { bold: true });
  if (doc.buyer.addressLine1) draw(doc.buyer.addressLine1);
  if (doc.buyer.postalCode || doc.buyer.city) {
    draw([doc.buyer.postalCode, doc.buyer.city].filter(Boolean).join(" "));
  }
  if (doc.buyer.vatNumber) draw(`TVA : ${doc.buyer.vatNumber}`);
  y -= 12;

  draw("Désignation", { bold: true });
  y -= 4;

  const lineTotalCents = doc.lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const taxTotalCents = doc.lines.reduce(
    (sum, line) => sum + Math.round((line.lineTotalCents * line.vatRate) / 100),
    0,
  );
  const grandTotalCents = lineTotalCents + taxTotalCents;

  for (const line of doc.lines) {
    for (const wrapped of wrapText(line.label, 70)) {
      if (y < 120) break;
      page.drawText(wrapped, { x: MARGIN, y, size: 10, font });
      y -= 14;
    }
    const detail = `${line.quantity} × ${formatEuros(line.quantity > 0 ? Math.round(line.lineTotalCents / line.quantity) : line.lineTotalCents)} HT · TVA ${line.vatRate} %`;
    page.drawText(detail, { x: MARGIN + 12, y, size: 9, font, color: rgb(0.35, 0.35, 0.35) });
    page.drawText(formatEuros(line.lineTotalCents), {
      x: PAGE_WIDTH - MARGIN - 80,
      y,
      size: 10,
      font: fontBold,
    });
    y -= 18;
  }

  y -= 8;
  draw(`Total HT : ${formatEuros(lineTotalCents)}`);
  draw(`Total TVA : ${formatEuros(taxTotalCents)}`);
  draw(`Total TTC : ${formatEuros(grandTotalCents)}`, { bold: true, size: 12 });

  if (doc.notes?.trim()) {
    y -= 10;
    draw("Notes", { bold: true });
    for (const noteLine of wrapText(doc.notes.trim(), 90)) {
      draw(noteLine);
    }
  }

  if (doc.legalMentions?.length) {
    y = Math.min(y, 120);
    for (const line of doc.legalMentions) {
      if (y < 40) break;
      page.drawText(line, { x: MARGIN, y, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
      y -= 10;
    }
  }

  pdf.setTitle(`Facture ${doc.invoiceNumber}`);
  pdf.setAuthor(doc.seller.name);
  pdf.setSubject(`Facture ${doc.invoiceNumber}`);
  pdf.setCreator("Soline");
  pdf.setProducer("Soline Factur-X");
  pdf.setCreationDate(doc.issueDate);
  pdf.setModificationDate(doc.issueDate);

  return pdf.save();
}
