import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { buildLegalMentionLines, type ArtisanLegalProfile } from "@/lib/billing/legal-mentions";

export type QuotePdfLine = {
  label: string;
  detail?: string;
  amountCents: number;
};

export type QuotePdfDocument = {
  quoteNumber: string;
  issueDate: Date;
  validUntil?: Date | null;
  seller: ArtisanLegalProfile & {
    addressLine1?: string | null;
    addressLine2?: string | null;
    postalCode?: string | null;
    city?: string | null;
    phone?: string | null;
    email?: string | null;
    logoUrl?: string | null;
  };
  buyer: {
    name: string;
    email?: string | null;
    addressLine1?: string | null;
    postalCode?: string | null;
    city?: string | null;
  };
  serviceLines: QuotePdfLine[];
  materialLines: QuotePdfLine[];
  laborTotalCents: number;
  materialsTotalCents: number;
  grandTotalCents: number;
  notes?: string | null;
  workSiteAddress?: string | null;
};

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

export async function renderQuotePdf(doc: QuotePdfDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE_HEIGHT - MARGIN;

  const draw = (text: string, opts: { size?: number; bold?: boolean; x?: number } = {}) => {
    const size = opts.size ?? 10;
    page.drawText(text, {
      x: opts.x ?? MARGIN,
      y,
      size,
      font: opts.bold ? fontBold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= size + 6;
  };

  draw("DEVIS", { size: 20, bold: true });
  draw(`Réf. ${doc.quoteNumber}`, { size: 12, bold: true });
  draw(`Date : ${formatDate(doc.issueDate)}`);
  if (doc.validUntil) draw(`Valable jusqu'au : ${formatDate(doc.validUntil)}`);
  y -= 8;

  draw("Émetteur", { size: 11, bold: true });
  draw(doc.seller.business_name, { bold: true });
  if (doc.seller.name) draw(doc.seller.name);
  if (doc.seller.addressLine1) draw(doc.seller.addressLine1);
  if (doc.seller.postalCode || doc.seller.city) {
    draw([doc.seller.postalCode, doc.seller.city].filter(Boolean).join(" "));
  }
  if (doc.seller.phone) draw(`Tél. : ${doc.seller.phone}`);
  y -= 8;

  draw("Client", { size: 11, bold: true });
  draw(doc.buyer.name, { bold: true });
  if (doc.buyer.addressLine1) draw(doc.buyer.addressLine1);
  if (doc.buyer.postalCode || doc.buyer.city) {
    draw([doc.buyer.postalCode, doc.buyer.city].filter(Boolean).join(" "));
  }
  if (doc.buyer.email) draw(doc.buyer.email);
  y -= 8;

  if (doc.workSiteAddress?.trim()) {
    draw("Chantier", { size: 11, bold: true });
    draw(doc.workSiteAddress.trim());
    y -= 8;
  }

  const drawSection = (title: string, lines: QuotePdfLine[]) => {
    if (!lines.length) return;
    draw(title, { bold: true });
    y -= 4;
    for (const line of lines) {
      if (y < 180) break;
      for (const wrapped of wrapText(line.label, 65)) {
        page.drawText(wrapped, { x: MARGIN, y, size: 10, font });
        y -= 14;
      }
      if (line.detail) {
        page.drawText(line.detail, {
          x: MARGIN + 12,
          y,
          size: 9,
          font,
          color: rgb(0.35, 0.35, 0.35),
        });
        y -= 14;
      }
      page.drawText(formatEuros(line.amountCents), {
        x: PAGE_WIDTH - MARGIN - 80,
        y: y + 14,
        size: 10,
        font: fontBold,
      });
      y -= 6;
    }
    y -= 8;
  };

  drawSection("Prestations", doc.serviceLines);
  drawSection("Fournitures", doc.materialLines);

  y -= 4;
  draw(`Main d'œuvre : ${formatEuros(doc.laborTotalCents)}`);
  draw(`Fournitures : ${formatEuros(doc.materialsTotalCents)}`);
  draw(`Total TTC : ${formatEuros(doc.grandTotalCents)}`, { bold: true, size: 12 });

  if (doc.notes?.trim()) {
    y -= 10;
    draw("Notes", { bold: true });
    for (const noteLine of wrapText(doc.notes.trim(), 90)) {
      if (y < 120) break;
      draw(noteLine);
    }
  }

  y = 100;
  const legalLines = buildLegalMentionLines(doc.seller);
  for (const line of legalLines) {
    page.drawText(line, { x: MARGIN, y, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 10;
  }

  pdf.setTitle(`Devis ${doc.quoteNumber}`);
  pdf.setAuthor(doc.seller.business_name);
  pdf.setCreator("Soline");
  pdf.setCreationDate(doc.issueDate);

  return pdf.save();
}
