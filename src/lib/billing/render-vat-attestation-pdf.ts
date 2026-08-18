import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type VatAttestationData = {
  artisanBusinessName: string;
  artisanName: string | null;
  artisanSiret: string | null;
  customerName: string;
  customerAddress: string | null;
  workSiteAddress: string;
  workSitePostalCode: string | null;
  workSiteCity: string | null;
  vatRate: 5.5 | 10;
  quoteId: string;
  quoteTotalHtEur: number;
  quoteDate: Date;
};

const MARGIN = 50;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

function formatEur(value: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

function wrapLines(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Attestation simplifiée TVA réduite (logement > 2 ans) — inspirée Cerfa 1301-SD.
 * Document informatif ; l'artisan doit compléter si besoin avec le formulaire officiel.
 */
export async function renderVatAttestationPdf(data: VatAttestationData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE_HEIGHT - MARGIN;

  const draw = (text: string, opts: { size?: number; bold?: boolean; indent?: number } = {}) => {
    const size = opts.size ?? 10;
    const usedFont = opts.bold ? fontBold : font;
    const x = MARGIN + (opts.indent ?? 0);
    for (const line of wrapLines(text, 90)) {
      page.drawText(line, { x, y, size, font: usedFont, color: rgb(0.1, 0.1, 0.1) });
      y -= size + 5;
    }
  };

  draw("ATTESTATION SIMPLIFIÉE — TVA À TAUX RÉDUIT", { size: 14, bold: true });
  draw(`Taux applicable : ${data.vatRate} % (logement achevé depuis plus de 2 ans)`, { size: 10 });
  draw(`Référence devis : ${data.quoteId.slice(0, 8).toUpperCase()} · Date : ${data.quoteDate.toLocaleDateString("fr-FR")}`);
  y -= 10;

  draw("1. Identité du client (acquéreur / maître d'ouvrage)", { size: 11, bold: true });
  draw(`Nom : ${data.customerName}`);
  if (data.customerAddress) draw(`Adresse : ${data.customerAddress}`);
  y -= 8;

  draw("2. Localisation des travaux", { size: 11, bold: true });
  draw(`Adresse du chantier : ${data.workSiteAddress}`);
  if (data.workSitePostalCode || data.workSiteCity) {
    draw([data.workSitePostalCode, data.workSiteCity].filter(Boolean).join(" "));
  }
  y -= 8;

  draw("3. Nature des travaux", { size: 11, bold: true });
  draw(
    "Les travaux concernent des locaux à usage d'habitation achevés depuis plus de deux ans au sens de l'article 278-0 bis A du CGI.",
  );
  draw(`Montant HT du devis concerné : ${formatEur(data.quoteTotalHtEur)}`);
  y -= 8;

  draw("4. Déclaration du client", { size: 11, bold: true });
  draw(
    "Je soussigné(e) certifie que les locaux concernés par les travaux sont achevés depuis plus de deux ans à la date de début des travaux, que ceux-ci ne relèvent pas du premier équipement du logement et qu'ils entrent dans le champ du taux réduit de TVA.",
  );
  y -= 16;

  draw("5. Entreprise exécutante", { size: 11, bold: true });
  draw(`${data.artisanBusinessName}${data.artisanName ? ` — ${data.artisanName}` : ""}`);
  if (data.artisanSiret) draw(`SIRET : ${data.artisanSiret}`);
  y -= 24;

  draw("Fait pour servir et valoir ce que de droit.", { size: 10 });
  y -= 30;
  draw("Date : _______________________", { size: 10 });
  y -= 20;
  draw("Signature du client :", { size: 10, bold: true });
  y -= 40;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + 220, y },
    thickness: 0.5,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 30;
  draw("Cachet et signature de l'entreprise :", { size: 10, bold: true });

  y = MARGIN + 40;
  draw(
    "Document généré par SolineBTP — modèle simplifié. En cas de contrôle, compléter si nécessaire avec le formulaire Cerfa n°1301-SD officiel.",
    { size: 8, indent: 0 },
  );

  return pdf.save();
}
