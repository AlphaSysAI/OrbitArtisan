import { PDFDocument, PDFPage, PDFFont, rgb, type RGB } from "pdf-lib";

import { formatEurosForPdf, sanitizePdfText } from "@/lib/billing/pdf-text";

export const PDF_PAGE_WIDTH = 595.28;
export const PDF_PAGE_HEIGHT = 841.89;
export const PDF_MARGIN = 45;
export const PDF_FOOTER_RESERVE = 130;

export const PDF_BRAND = rgb(36 / 255, 52 / 255, 71 / 255);
export const PDF_TEXT = rgb(0.12, 0.12, 0.12);
export const PDF_MUTED = rgb(0.45, 0.45, 0.45);
export const PDF_LINE = rgb(0.82, 0.82, 0.82);

export type PdfFonts = {
  regular: PDFFont;
  bold: PDFFont;
};

export function wrapPdfText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
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
  return lines.length ? lines : [text];
}

export class PdfLayoutWriter {
  private page: PDFPage;
  private y: number;

  constructor(
    private pdf: PDFDocument,
    private fonts: PdfFonts,
  ) {
    this.page = pdf.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT]);
    this.y = PDF_PAGE_HEIGHT - PDF_MARGIN;
  }

  get currentY(): number {
    return this.y;
  }

  setY(value: number): void {
    this.y = value;
  }

  ensureSpace(minY: number): void {
    if (this.y >= minY) return;
    this.page = this.pdf.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT]);
    this.y = PDF_PAGE_HEIGHT - PDF_MARGIN;
  }

  drawText(
    text: string,
    opts: {
      x?: number;
      size?: number;
      bold?: boolean;
      color?: RGB;
      maxWidthChars?: number;
      lineGap?: number;
    } = {},
  ): void {
    const size = opts.size ?? 9;
    const x = opts.x ?? PDF_MARGIN;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const color = opts.color ?? PDF_TEXT;
    const lines = opts.maxWidthChars ? wrapPdfText(text, opts.maxWidthChars) : [text];
    const gap = opts.lineGap ?? size + 4;

    for (const line of lines) {
      this.ensureSpace(PDF_FOOTER_RESERVE);
      this.page.drawText(sanitizePdfText(line), { x, y: this.y, size, font, color });
      this.y -= gap;
    }
  }

  drawRule(yOffset = 6): void {
    this.y -= yOffset;
    this.page.drawLine({
      start: { x: PDF_MARGIN, y: this.y },
      end: { x: PDF_PAGE_WIDTH - PDF_MARGIN, y: this.y },
      thickness: 0.75,
      color: PDF_LINE,
    });
    this.y -= 10;
  }

  drawTableHeader(columns: { label: string; x: number; width: number }[]): void {
    this.ensureSpace(PDF_FOOTER_RESERVE + 20);
    for (const col of columns) {
      this.page.drawText(sanitizePdfText(col.label), {
        x: col.x,
        y: this.y,
        size: 8,
        font: this.fonts.bold,
        color: PDF_BRAND,
      });
    }
    this.y -= 14;
    this.drawRule(2);
  }

  drawAmountRight(amountCents: number, x: number, y: number, size = 9, bold = false): void {
    this.page.drawText(formatEurosForPdf(amountCents), {
      x,
      y,
      size,
      font: bold ? this.fonts.bold : this.fonts.regular,
      color: PDF_TEXT,
    });
  }

  getPage(): PDFPage {
    return this.page;
  }
}

/** Colonnes standard devis / facture. */
export const PDF_TABLE_COLS = {
  designation: { x: PDF_MARGIN, width: 230 },
  qty: { x: 280, width: 45 },
  unit: { x: 330, width: 70 },
  vat: { x: 405, width: 35 },
  total: { x: PDF_PAGE_WIDTH - PDF_MARGIN - 72, width: 72 },
} as const;
