/**
 * Mise en page commune devis / factures (pdf-lib, police Inter embarquée).
 *
 * Un seul gabarit pour tous les documents commerciaux : en-tête avec logo,
 * blocs émetteur / client, tableau multi-pages (en-tête répété), récapitulatif
 * TVA par taux, pied de page numéroté. Les calculs de montants restent chez
 * l'appelant : ce module ne fait QUE de la présentation.
 */
import { PDFDocument, PDFPage, rgb, type PDFFont, type PDFImage, type RGB } from "pdf-lib";

import { embedDocumentFonts } from "@/lib/billing/pdf-fonts";

import { formatEurosForPdf, sanitizePdfText } from "@/lib/billing/pdf-text";

export const A4 = { width: 595.28, height: 841.89 } as const;
const M = 40; // marge
const CONTENT_W = A4.width - 2 * M;
const FOOTER_H = 34;
const BOTTOM = M + FOOTER_H; // plus bas y utilisable

const INK = rgb(0.11, 0.13, 0.16);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.86, 0.88, 0.9);
const ZEBRA = rgb(0.972, 0.976, 0.98);
const WHITE = rgb(1, 1, 1);
const DEFAULT_ACCENT = rgb(0.145, 0.204, 0.278); // bleu ardoise Soline

export type PdfTheme = { accent: RGB; accentSoft: RGB };

/** Couleur d'accent de l'artisan si elle reste lisible en texte blanc, sinon ardoise. */
export function resolvePdfTheme(accentHex: string | null | undefined): PdfTheme {
  let accent = DEFAULT_ACCENT;
  const m = accentHex?.trim().match(/^#?([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1]!, 16);
    let r = ((n >> 16) & 255) / 255;
    let g = ((n >> 8) & 255) / 255;
    let b = (n & 255) / 255;
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const luminance = () => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    // Texte blanc sur l'accent : contraste ≥ 4.5:1 ⇔ luminance ≤ ~0.18.
    // Couleur trop claire → on l'assombrit en gardant la teinte de l'artisan.
    for (let i = 0; i < 30 && luminance() > 0.18; i++) {
      r *= 0.92;
      g *= 0.92;
      b *= 0.92;
    }
    accent = rgb(r, g, b);
  }
  const mix = (c: number) => 1 - (1 - c) * 0.08;
  return { accent, accentSoft: rgb(mix(accent.red), mix(accent.green), mix(accent.blue)) };
}

export async function embedLogoImage(pdf: PDFDocument, bytes: Uint8Array | null | undefined): Promise<PDFImage | null> {
  if (!bytes?.length) return null;
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await pdf.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdf.embedJpg(bytes);
  } catch {
    // PNG 16 bits / entrelacé non supporté : document sans logo plutôt qu'aucun document.
  }
  return null;
}

export type TableRow = {
  designation: string;
  detail?: string | null;
  quantity: string;
  unitPrice: string;
  vat: string;
  total: string;
};

export type TotalsRow = { label: string; value: string; strong?: boolean; highlight?: boolean };

const COLS = {
  designation: { x: M + 8, w: 240 },
  qty: { right: M + 330 },
  unit: { right: M + 405 },
  vat: { right: M + 445 },
  total: { right: A4.width - M - 8 },
} as const;

export class CommercialPdf {
  readonly pdf: PDFDocument;
  private page!: PDFPage;
  private y = 0;
  private tableHeaderOnBreak = false;

  private constructor(
    pdf: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
    private readonly theme: PdfTheme,
  ) {
    this.pdf = pdf;
    this.newPage();
  }

  static async create(theme: PdfTheme): Promise<CommercialPdf> {
    const pdf = await PDFDocument.create();
    const { regular, bold } = await embedDocumentFonts(pdf);
    return new CommercialPdf(pdf, regular, bold, theme);
  }

  // ---------------------------------------------------------------- primitives

  private newPage() {
    this.page = this.pdf.addPage([A4.width, A4.height]);
    // Filet d'accent en tête de chaque page.
    this.page.drawRectangle({ x: 0, y: A4.height - 6, width: A4.width, height: 6, color: this.theme.accent });
    this.y = A4.height - M;
  }

  private ensure(height: number) {
    if (this.y - height >= BOTTOM) return;
    this.newPage();
    if (this.tableHeaderOnBreak) this.drawTableHeader();
  }

  private font(bold?: boolean) {
    return bold ? this.bold : this.regular;
  }

  width(text: string, size: number, bold?: boolean): number {
    return this.font(bold).widthOfTextAtSize(sanitizePdfText(text), size);
  }

  /** Découpe au pixel près (et coupe les mots plus longs que la colonne). */
  wrap(text: string, size: number, maxWidth: number, bold?: boolean): string[] {
    const out: string[] = [];
    for (const paragraph of sanitizePdfText(text).split(/\r?\n/)) {
      let line = "";
      for (const rawWord of paragraph.split(/\s+/).filter(Boolean)) {
        let word = rawWord;
        while (this.width(word, size, bold) > maxWidth && word.length > 1) {
          let cut = word.length - 1;
          while (cut > 1 && this.width(word.slice(0, cut), size, bold) > maxWidth) cut--;
          if (line) {
            out.push(line);
            line = "";
          }
          out.push(word.slice(0, cut));
          word = word.slice(cut);
        }
        const candidate = line ? `${line} ${word}` : word;
        if (this.width(candidate, size, bold) > maxWidth && line) {
          out.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      out.push(line);
    }
    return out;
  }

  private text(t: string, x: number, y: number, size: number, opts: { bold?: boolean; color?: RGB } = {}) {
    this.page.drawText(sanitizePdfText(t), { x, y, size, font: this.font(opts.bold), color: opts.color ?? INK });
  }

  private textRight(t: string, right: number, y: number, size: number, opts: { bold?: boolean; color?: RGB } = {}) {
    this.text(t, right - this.width(t, size, opts.bold), y, size, opts);
  }

  gap(h: number) {
    this.y -= h;
  }

  // ---------------------------------------------------------------- blocs

  /**
   * En-tête : logo (ou raison sociale en grand) + coordonnées émetteur à gauche,
   * type de document, numéro et dates à droite.
   */
  drawHeader(params: {
    logo: PDFImage | null;
    sellerName: string;
    sellerLines: string[];
    sellerLegal: string[];
    title: string;
    number: string;
    meta: [string, string][];
  }) {
    const top = this.y;
    let leftY = top;

    if (params.logo) {
      const maxW = 170;
      const maxH = 64;
      const scale = Math.min(maxW / params.logo.width, maxH / params.logo.height, 1);
      const w = params.logo.width * scale;
      const h = params.logo.height * scale;
      this.page.drawImage(params.logo, { x: M, y: top - h + 8, width: w, height: h });
      leftY = top - h - 6;
      this.text(params.sellerName, M, leftY, 10.5, { bold: true });
    } else {
      // Pas de logo : la raison sociale tient lieu de marque.
      const lines = this.wrap(params.sellerName, 17, 280, true);
      for (const l of lines.slice(0, 2)) {
        this.text(l, M, leftY - 8, 17, { bold: true, color: this.theme.accent });
        leftY -= 21;
      }
      leftY -= 4;
    }
    leftY -= 13;
    for (const l of params.sellerLines) {
      this.text(l, M, leftY, 8.5, { color: INK });
      leftY -= 11.5;
    }
    for (const l of params.sellerLegal) {
      this.text(l, M, leftY, 7.5, { color: MUTED });
      leftY -= 10;
    }

    // Colonne droite
    const right = A4.width - M;
    let rightY = top - 14;
    this.textRight(params.title, right, rightY, 22, { bold: true, color: this.theme.accent });
    rightY -= 18;
    this.textRight(`N° ${params.number}`, right, rightY, 10.5, { bold: true });
    rightY -= 18;
    for (const [label, value] of params.meta) {
      const vw = this.width(value, 8.5, true);
      this.textRight(value, right, rightY, 8.5, { bold: true });
      this.textRight(label, right - vw - 6, rightY, 8.5, { color: MUTED });
      rightY -= 12;
    }

    this.y = Math.min(leftY, rightY) - 10;
  }

  /** Cartes côte à côte (ex. « Lieu d'intervention » / « Client »). La carte client est toujours à droite. */
  drawParties(cards: { left?: { label: string; lines: string[] } | null; right: { label: string; lines: string[] } }) {
    const cardW = (CONTENT_W - 14) / 2;
    const pad = 10;
    const layout = (card: { label: string; lines: string[] }) => {
      const wrapped = card.lines.flatMap((l, i) => this.wrap(l, i === 0 ? 10 : 8.5, cardW - 2 * pad, i === 0));
      return { label: card.label, lines: wrapped, h: pad + 12 + wrapped.length * 12 + pad - 2 };
    };
    const right = layout(cards.right);
    const left = cards.left ? layout(cards.left) : null;
    const h = Math.max(right.h, left?.h ?? 0);
    this.ensure(h + 10);
    const top = this.y;

    const drawCard = (x: number, card: { label: string; lines: string[] }, tinted: boolean) => {
      this.page.drawRectangle({
        x,
        y: top - h,
        width: cardW,
        height: h,
        color: tinted ? this.theme.accentSoft : WHITE,
        borderColor: tinted ? undefined : RULE,
        borderWidth: tinted ? 0 : 0.75,
      });
      let cy = top - pad - 7;
      this.text(card.label.toUpperCase(), x + pad, cy, 7, { bold: true, color: this.theme.accent });
      cy -= 14;
      card.lines.forEach((l, i) => {
        this.text(l, x + pad, cy, i === 0 ? 10 : 8.5, { bold: i === 0 });
        cy -= 12;
      });
    };

    if (left) drawCard(M, left, false);
    drawCard(M + cardW + 14, right, true);
    this.y = top - h - 18;
  }

  sectionTitle(title: string) {
    this.ensure(30);
    this.text(title.toUpperCase(), M, this.y, 8, { bold: true, color: this.theme.accent });
    this.y -= 6;
    this.page.drawLine({
      start: { x: M, y: this.y },
      end: { x: A4.width - M, y: this.y },
      thickness: 0.6,
      color: RULE,
    });
    this.y -= 12;
  }

  private hideVat = false;

  private drawTableHeader() {
    const h = 20;
    this.page.drawRectangle({ x: M, y: this.y - h + 6, width: CONTENT_W, height: h, color: this.theme.accent });
    const ty = this.y - 7;
    const o = { bold: true, color: WHITE };
    this.text("Désignation", COLS.designation.x, ty, 8, o);
    this.textRight("Qté", COLS.qty.right, ty, 8, o);
    // Franchise 293 B : prix nets, pas de mention « HT » (aucune TVA facturée).
    this.textRight(this.hideVat ? "Prix unit." : "PU HT", COLS.unit.right, ty, 8, o);
    if (!this.hideVat) this.textRight("TVA", COLS.vat.right, ty, 8, o);
    this.textRight(this.hideVat ? "Total" : "Total HT", COLS.total.right, ty, 8, o);
    this.y -= h + 6;
  }

  /** hideVat : franchise en base (293 B), aucune colonne TVA sur le document. */
  drawTable(rows: TableRow[], opts: { hideVat?: boolean } = {}) {
    this.hideVat = Boolean(opts.hideVat);
    this.ensure(60);
    this.drawTableHeader();
    this.tableHeaderOnBreak = true;

    rows.forEach((row, index) => {
      const titleLines = this.wrap(row.designation, 9, COLS.designation.w, true);
      const detailLines = row.detail ? this.wrap(row.detail, 7.5, COLS.designation.w) : [];
      const h = 8 + titleLines.length * 11.5 + detailLines.length * 10 + 4;
      this.ensure(h);
      const top = this.y + 8;
      if (index % 2 === 1) {
        this.page.drawRectangle({ x: M, y: top - h, width: CONTENT_W, height: h, color: ZEBRA });
      }
      let ly = this.y - 2;
      const firstY = ly;
      for (const l of titleLines) {
        this.text(l, COLS.designation.x, ly, 9, { bold: true });
        ly -= 11.5;
      }
      for (const l of detailLines) {
        this.text(l, COLS.designation.x, ly + 1, 7.5, { color: MUTED });
        ly -= 10;
      }
      this.textRight(row.quantity, COLS.qty.right, firstY, 9);
      this.textRight(row.unitPrice, COLS.unit.right, firstY, 9);
      if (!this.hideVat) this.textRight(row.vat, COLS.vat.right, firstY, 9, { color: MUTED });
      this.textRight(row.total, COLS.total.right, firstY, 9, { bold: true });
      this.y = top - h - 8;
    });

    this.tableHeaderOnBreak = false;
    this.page.drawLine({
      start: { x: M, y: this.y + 6 },
      end: { x: A4.width - M, y: this.y + 6 },
      thickness: 0.6,
      color: RULE,
    });
    this.y -= 6;
  }

  /** Récapitulatif aligné à droite ; la ligne `highlight` (TTC / net à payer) est sur fond d'accent. */
  drawTotals(rows: TotalsRow[], note?: string[]) {
    const boxW = 240;
    const x = A4.width - M - boxW;
    const rowH = 16;
    const h = rows.reduce((s, r) => s + (r.highlight ? rowH + 8 : rowH), 0);
    const noteLines = (note ?? []).flatMap((n) => this.wrap(n, 7.5, CONTENT_W - boxW - 20));
    this.ensure(Math.max(h, noteLines.length * 10) + 10);
    const top = this.y;
    let ty = this.y;
    for (const r of rows) {
      if (r.highlight) {
        ty -= 4;
        this.page.drawRectangle({ x, y: ty - rowH + 2, width: boxW, height: rowH + 6, color: this.theme.accent });
        this.text(r.label, x + 10, ty - 9, 10.5, { bold: true, color: WHITE });
        this.textRight(r.value, x + boxW - 10, ty - 9, 11, { bold: true, color: WHITE });
        ty -= rowH + 4;
      } else {
        this.text(r.label, x + 10, ty - 8, 9, { bold: r.strong, color: r.strong ? INK : MUTED });
        this.textRight(r.value, x + boxW - 10, ty - 8, 9, { bold: r.strong });
        ty -= rowH;
      }
    }
    let ny = top - 8;
    for (const l of noteLines) {
      this.text(l, M, ny, 7.5, { color: MUTED });
      ny -= 10;
    }
    this.y = Math.min(ty, ny) - 16;
  }

  paragraph(text: string, opts: { size?: number; bold?: boolean; color?: RGB; lineGap?: number } = {}) {
    const size = opts.size ?? 8.5;
    const gap = opts.lineGap ?? size + 3.5;
    for (const l of this.wrap(text, size, CONTENT_W, opts.bold)) {
      this.ensure(gap);
      this.text(l, M, this.y, size, { bold: opts.bold, color: opts.color ?? INK });
      this.y -= gap;
    }
  }

  /** Encadré teinté (conditions de règlement, mention importante). */
  callout(lines: { text: string; bold?: boolean }[]) {
    const pad = 10;
    const wrapped = lines.flatMap((l) => this.wrap(l.text, 8.5, CONTENT_W - 2 * pad - 4, l.bold).map((t) => ({ t, bold: l.bold })));
    const h = pad * 2 + wrapped.length * 12 - 4;
    this.ensure(h + 8);
    const top = this.y + 4;
    this.page.drawRectangle({ x: M, y: top - h, width: CONTENT_W, height: h, color: this.theme.accentSoft });
    this.page.drawRectangle({ x: M, y: top - h, width: 3, height: h, color: this.theme.accent });
    let ly = top - pad - 7;
    for (const w of wrapped) {
      this.text(w.t, M + pad + 4, ly, 8.5, { bold: w.bold });
      ly -= 12;
    }
    this.y = top - h - 14;
  }

  /** Bloc « Bon pour accord » : mentions + cadre de signature. */
  signatureBlock(params: { title: string; lines: string[] }) {
    const boxH = 70;
    this.ensure(boxH + 40 + params.lines.length * 11);
    this.sectionTitle(params.title);
    for (const l of params.lines) this.paragraph(l, { size: 8.5 });
    this.y -= 4;
    const half = (CONTENT_W - 14) / 2;
    const labels = ["Date", "Signature du client (précédée de « Bon pour accord »)"];
    labels.forEach((label, i) => {
      const x = M + i * (half + 14);
      this.page.drawRectangle({
        x,
        y: this.y - boxH,
        width: half,
        height: boxH,
        borderColor: RULE,
        borderWidth: 0.75,
      });
      this.text(label, x + 8, this.y - 12, 7.5, { color: MUTED });
    });
    this.y -= boxH + 16;
  }

  /** Pied de page sur toutes les pages : identité légale courte + pagination. */
  finalize(params: { footerLeft: string; documentRef: string }): Promise<Uint8Array> {
    const pages = this.pdf.getPages();
    pages.forEach((p, i) => {
      p.drawLine({ start: { x: M, y: M + 16 }, end: { x: A4.width - M, y: M + 16 }, thickness: 0.5, color: RULE });
      const left = sanitizePdfText(params.footerLeft);
      const maxLeft = CONTENT_W - 120;
      let shown = left;
      while (shown.length > 10 && this.regular.widthOfTextAtSize(shown, 7) > maxLeft) shown = shown.slice(0, -2);
      if (shown !== left) shown = `${shown.trimEnd()}…`;
      p.drawText(shown, { x: M, y: M + 4, size: 7, font: this.regular, color: MUTED });
      const right = sanitizePdfText(`${params.documentRef} · Page ${i + 1}/${pages.length}`);
      p.drawText(right, {
        x: A4.width - M - this.regular.widthOfTextAtSize(right, 7),
        y: M + 4,
        size: 7,
        font: this.regular,
        color: MUTED,
      });
    });
    return this.pdf.save();
  }
}

/** Quantité lisible : 2 → « 2 », 1.5 → « 1,5 ». */
export function formatQtyForPdf(quantity: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(quantity);
}

export function formatRateForPdf(rate: number): string {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(rate)} %`;
}

export { formatEurosForPdf };
