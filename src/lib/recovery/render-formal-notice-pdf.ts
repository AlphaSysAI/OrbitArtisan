import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { formatDateForPdf, formatEurosForPdf, sanitizePdfText } from "@/lib/billing/pdf-text";
// Point 5 audit pré-pilote : constantes désormais partagées avec la mention
// de pénalités affichée sur la facture elle-même (late-payment-legal.ts),
// pour ne jamais risquer une divergence de taux/indemnité entre les deux.
import { DEFAULT_B2B_PENALTY_RATE, B2B_RECOVERY_INDEMNITY_CENTS } from "@/lib/billing/late-payment-legal";

const MARGIN = 56;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const BODY_SIZE = 10;
const LINE_HEIGHT = 14;

export type FormalNoticeParty = {
  name: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  countryCode?: string | null;
  siret?: string | null;
  siren?: string | null;
  vatNumber?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type FormalNoticeDocument = {
  invoiceNumber: string;
  invoiceIssueDate: Date;
  dueDate: Date | null;
  /** Principal TTC restant dû, en centimes. */
  amountDueCents: number;
  creditor: FormalNoticeParty;
  debtor: FormalNoticeParty;
  /** `true` si le débiteur est un professionnel (déclenche les pénalités L441-10). */
  isBusinessDebtor: boolean;
  /** Délai de règlement accordé, en jours. */
  graceDays?: number;
  noticeDate?: Date;
  /** Taux annuel de pénalités appliqué (défaut : taux légal B2B). */
  penaltyRate?: number;
};

export type FormalNoticeAmounts = {
  principalCents: number;
  penaltiesCents: number;
  indemnityCents: number;
  totalCents: number;
  daysOverdue: number;
};

const formatEuros = formatEurosForPdf;
const formatDate = formatDateForPdf;

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

function addressLines(party: FormalNoticeParty): string[] {
  const lines = [party.name];
  if (party.addressLine1) lines.push(party.addressLine1);
  if (party.addressLine2) lines.push(party.addressLine2);
  const cityLine = [party.postalCode, party.city].filter(Boolean).join(" ");
  if (cityLine) lines.push(cityLine);
  if (party.countryCode && party.countryCode !== "FR") lines.push(party.countryCode);
  return lines;
}

/**
 * Calcule les sommes exigibles : principal, pénalités de retard et indemnité
 * forfaitaire de recouvrement (B2B uniquement).
 */
export function computeFormalNoticeAmounts(doc: FormalNoticeDocument): FormalNoticeAmounts {
  const reference = doc.noticeDate ?? new Date();
  const daysOverdue = doc.dueDate
    ? Math.max(0, Math.floor((reference.getTime() - doc.dueDate.getTime()) / 86_400_000))
    : 0;

  if (!doc.isBusinessDebtor || daysOverdue === 0) {
    return {
      principalCents: doc.amountDueCents,
      penaltiesCents: 0,
      indemnityCents: 0,
      totalCents: doc.amountDueCents,
      daysOverdue,
    };
  }

  const rate = doc.penaltyRate ?? DEFAULT_B2B_PENALTY_RATE;
  const penaltiesCents = Math.round((doc.amountDueCents * rate * daysOverdue) / (100 * 365));

  return {
    principalCents: doc.amountDueCents,
    penaltiesCents,
    indemnityCents: B2B_RECOVERY_INDEMNITY_CENTS,
    totalCents: doc.amountDueCents + penaltiesCents + B2B_RECOVERY_INDEMNITY_CENTS,
    daysOverdue,
  };
}

/**
 * Génère la mise en demeure de payer, destinée à un envoi en LRAR papier.
 * Le document porte les mentions rendant la mise en demeure opposable
 * (art. 1344 du Code civil) et le décompte des sommes exigibles.
 */
export async function renderFormalNoticePdf(doc: FormalNoticeDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const noticeDate = doc.noticeDate ?? new Date();
  const graceDays = doc.graceDays ?? 8;
  const amounts = computeFormalNoticeAmounts({ ...doc, noticeDate });
  const deadline = new Date(noticeDate.getTime() + graceDays * 86_400_000);

  let y = PAGE_HEIGHT - MARGIN;

  const draw = (
    text: string,
    opts: { size?: number; bold?: boolean; x?: number; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const size = opts.size ?? BODY_SIZE;
    page.drawText(sanitizePdfText(text), {
      x: opts.x ?? MARGIN,
      y,
      size,
      font: opts.bold ? fontBold : font,
      color: opts.color ?? rgb(0.1, 0.1, 0.1),
    });
    y -= size + 4;
  };

  const paragraph = (text: string, opts: { bold?: boolean; maxChars?: number } = {}) => {
    for (const line of wrapText(text, opts.maxChars ?? 92)) {
      page.drawText(sanitizePdfText(line), {
        x: MARGIN,
        y,
        size: BODY_SIZE,
        font: opts.bold ? fontBold : font,
      });
      y -= LINE_HEIGHT;
    }
  };

  // -- Expéditeur (colonne gauche)
  const creditorLines = addressLines(doc.creditor);
  const creditorTop = y;
  for (const [index, line] of creditorLines.entries()) {
    page.drawText(sanitizePdfText(line), {
      x: MARGIN,
      y: creditorTop - index * 12,
      size: 9,
      font: index === 0 ? fontBold : font,
    });
  }
  if (doc.creditor.siret) {
    page.drawText(`SIRET : ${doc.creditor.siret}`, {
      x: MARGIN,
      y: creditorTop - creditorLines.length * 12,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  // -- Destinataire (colonne droite)
  const debtorLines = addressLines(doc.debtor);
  const debtorX = PAGE_WIDTH / 2 + 20;
  for (const [index, line] of debtorLines.entries()) {
    page.drawText(sanitizePdfText(line), {
      x: debtorX,
      y: creditorTop - index * 12,
      size: 9,
      font: index === 0 ? fontBold : font,
    });
  }

  y = creditorTop - Math.max(creditorLines.length + 1, debtorLines.length) * 12 - 24;

  draw(
    `${doc.creditor.city ?? ""}${doc.creditor.city ? ", le " : "Le "}${formatDate(noticeDate)}`,
    { x: debtorX, size: 9 },
  );
  y -= 8;

  draw("LETTRE RECOMMANDÉE AVEC ACCUSÉ DE RÉCEPTION", { size: 9, bold: true });
  y -= 6;

  draw(`Objet : MISE EN DEMEURE DE PAYER — Facture n° ${doc.invoiceNumber}`, {
    size: 12,
    bold: true,
  });
  y -= 10;

  paragraph("Madame, Monsieur,");
  y -= 6;

  paragraph(
    `Sauf erreur ou omission de notre part, notre facture n° ${doc.invoiceNumber} du ${formatDate(
      doc.invoiceIssueDate,
    )}, d'un montant de ${formatEuros(amounts.principalCents)} TTC, demeure impayée à ce jour${
      doc.dueDate ? `, alors que son échéance était fixée au ${formatDate(doc.dueDate)}` : ""
    }${amounts.daysOverdue > 0 ? `, soit un retard de ${amounts.daysOverdue} jours` : ""}.`,
  );
  y -= 6;

  paragraph(
    "Nos relances amiables étant restées sans effet, nous vous mettons en demeure, par la présente, de régler les sommes ci-après détaillées.",
  );
  y -= 10;

  // -- Décompte des sommes dues
  draw("Décompte des sommes exigibles", { size: 11, bold: true });
  y -= 2;

  const amountRow = (label: string, cents: number, bold = false) => {
    page.drawText(sanitizePdfText(label), { x: MARGIN, y, size: BODY_SIZE, font: bold ? fontBold : font });
    page.drawText(formatEuros(cents), {
      x: PAGE_WIDTH - MARGIN - 90,
      y,
      size: BODY_SIZE,
      font: bold ? fontBold : font,
    });
    y -= LINE_HEIGHT;
  };

  amountRow("Principal restant dû (TTC)", amounts.principalCents);
  if (amounts.penaltiesCents > 0) {
    amountRow(
      `Pénalités de retard (${(doc.penaltyRate ?? DEFAULT_B2B_PENALTY_RATE).toFixed(2)} % l'an, ${amounts.daysOverdue} j)`,
      amounts.penaltiesCents,
    );
  }
  if (amounts.indemnityCents > 0) {
    amountRow("Indemnité forfaitaire de recouvrement", amounts.indemnityCents);
  }
  y -= 2;
  page.drawLine({
    start: { x: MARGIN, y: y + 8 },
    end: { x: PAGE_WIDTH - MARGIN, y: y + 8 },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  amountRow("TOTAL À RÉGLER", amounts.totalCents, true);
  y -= 10;

  paragraph(
    `Vous disposez d'un délai de ${graceDays} jours à compter de la réception de la présente, soit jusqu'au ${formatDate(
      deadline,
    )}, pour procéder au règlement intégral de cette somme.`,
    { bold: true },
  );
  y -= 6;

  paragraph(
    "À défaut de paiement dans ce délai, nous serons contraints de confier le recouvrement de notre créance à un professionnel habilité et d'engager toute procédure judiciaire utile, notamment une requête en injonction de payer (articles 1405 et suivants du Code de procédure civile), sans nouvel avertissement.",
  );
  y -= 6;

  paragraph(
    "La présente lettre constitue une mise en demeure au sens de l'article 1344 du Code civil. Elle fait courir les intérêts moratoires et interrompt la prescription.",
  );
  y -= 6;

  if (doc.isBusinessDebtor) {
    paragraph(
      "Nous vous rappelons qu'en application de l'article L441-10 du Code de commerce, tout retard de paiement entre professionnels entraîne de plein droit l'exigibilité de pénalités de retard, ainsi qu'une indemnité forfaitaire pour frais de recouvrement de 40 € (article D441-5 du Code de commerce).",
    );
  } else {
    paragraph(
      "Conformément à l'article 1231-6 du Code civil, le retard de paiement ouvre droit au versement d'intérêts moratoires au taux légal en vigueur.",
    );
  }
  y -= 8;

  paragraph("Nous vous prions d'agréer, Madame, Monsieur, l'expression de nos salutations distinguées.");
  y -= 18;

  draw(doc.creditor.name, { bold: true });
  if (doc.creditor.phone) draw(`Tél. : ${doc.creditor.phone}`, { size: 9 });
  if (doc.creditor.email) draw(doc.creditor.email, { size: 9 });

  // -- Pied de page : références légales de l'émetteur
  const footer = [
    doc.creditor.siret ? `SIRET ${doc.creditor.siret}` : null,
    doc.creditor.vatNumber ? `TVA ${doc.creditor.vatNumber}` : null,
  ].filter((value): value is string => Boolean(value));

  if (footer.length > 0) {
    page.drawText(sanitizePdfText(footer.join(" · ")), {
      x: MARGIN,
      y: 40,
      size: 7,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
  }

  pdf.setTitle(`Mise en demeure — Facture ${doc.invoiceNumber}`);
  pdf.setAuthor(doc.creditor.name);
  pdf.setSubject(`Mise en demeure de payer — facture ${doc.invoiceNumber}`);
  pdf.setCreator("Soline");
  pdf.setCreationDate(noticeDate);
  pdf.setModificationDate(noticeDate);

  return pdf.save();
}
