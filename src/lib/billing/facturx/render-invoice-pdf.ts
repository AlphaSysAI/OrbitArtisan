import {
  CommercialPdf,
  embedLogoImage,
  formatEurosForPdf,
  formatQtyForPdf,
  formatRateForPdf,
  resolvePdfTheme,
  type TotalsRow,
} from "@/lib/billing/pdf-document";
import { formatDateForPdf } from "@/lib/billing/pdf-text";
import { invoiceTypeLabel } from "@/lib/billing/invoice-types";

import type { FacturXInvoiceDocument } from "./types";
import { materialUnitLabel } from "@/lib/quotes/material-unit";

type InvoicePdfVatGroup = {
  rate: number;
  categoryCode: string;
  baseCents: number;
  taxCents: number;
  exemptionReason: string | null;
};

/**
 * Ventilation TVA IDENTIQUE au XML CII (build-cii-invoice.ts) et à l'e-reporting :
 * TVA arrondie ligne par ligne puis sommée par (catégorie, taux). Le PDF et le XML
 * d'une même facture Factur-X ne doivent jamais diverger d'un centime.
 */
export function computeInvoicePdfTotals(lines: FacturXInvoiceDocument["lines"]) {
  const groups = new Map<string, InvoicePdfVatGroup>();
  for (const line of lines) {
    const key = `${line.vatCategoryCode}:${line.vatRate}`;
    const taxCents = Math.round((line.lineTotalCents * line.vatRate) / 100);
    const g = groups.get(key);
    if (g) {
      g.baseCents += line.lineTotalCents;
      g.taxCents += taxCents;
    } else {
      groups.set(key, {
        rate: line.vatRate,
        categoryCode: line.vatCategoryCode,
        baseCents: line.lineTotalCents,
        taxCents,
        exemptionReason: line.vatExemptionReason ?? null,
      });
    }
  }
  const vatGroups = [...groups.values()].sort((a, b) => b.rate - a.rate);
  const totalHtCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const totalVatCents = vatGroups.reduce((s, g) => s + g.taxCents, 0);
  return { vatGroups, totalHtCents, totalVatCents, totalTtcCents: totalHtCents + totalVatCents };
}

/** Génère le PDF visuel (lisible) avant embarquement Factur-X. */
export async function renderInvoicePdf(doc: FacturXInvoiceDocument): Promise<Uint8Array> {
  const out = await CommercialPdf.create(resolvePdfTheme(doc.branding?.accentColor));
  const logo = await embedLogoImage(out.pdf, doc.branding?.logoBytes);
  const s = doc.seller;
  const b = doc.buyer;

  // Point 1 audit pré-pilote : le titre reflète la vraie nature du document.
  const label = invoiceTypeLabel(doc.invoiceType);
  const isCreditNote = doc.invoiceType === "credit_note";
  // Affichage signé pour un avoir (lisibilité client). Cosmétique uniquement :
  // le CII garde des montants positifs + typeCode 381 (EN16931).
  const sign = isCreditNote ? -1 : 1;
  const eur = (cents: number) => formatEurosForPdf(sign * cents);

  const meta: [string, string][] = [["Date d'émission", formatDateForPdf(doc.issueDate)]];
  // Point 5 audit pré-pilote : échéance affichée.
  if (doc.dueDate && !isCreditNote) meta.push(["Échéance", formatDateForPdf(doc.dueDate)]);

  out.drawHeader({
    logo,
    sellerName: s.name,
    sellerLines: [
      s.addressLine1,
      s.addressLine2,
      [s.postalCode, s.city].filter(Boolean).join(" ") || null,
      s.phone ? `Tél. ${s.phone}` : null,
      s.email,
    ].filter((l): l is string => Boolean(l?.trim())),
    sellerLegal: [
      s.siret ? `SIRET ${s.siret}` : s.siren ? `SIREN ${s.siren}` : null,
      s.vatNumber ? `TVA ${s.vatNumber}` : null,
    ].filter((l): l is string => Boolean(l)),
    title: label.toUpperCase(),
    number: doc.invoiceNumber,
    meta,
  });

  out.drawParties({
    right: {
      label: "Facturé à",
      lines: [
        b.name,
        b.addressLine1,
        b.addressLine2,
        [b.postalCode, b.city].filter(Boolean).join(" ") || null,
        b.siret ? `SIRET ${b.siret}` : b.siren ? `SIREN ${b.siren}` : null,
        b.vatNumber ? `TVA ${b.vatNumber}` : null,
        b.email,
      ].filter((l): l is string => Boolean(l?.trim())),
    },
  });

  // Franchise en base (293 B) : lignes à 0 %, catégorie E — aucune TVA affichée.
  const vatFranchise = doc.lines.length > 0 && doc.lines.every((l) => l.vatRate === 0 && l.vatCategoryCode === "E");

  out.sectionTitle(isCreditNote ? "Détail de l'avoir" : "Détail des prestations");
  out.drawTable(
    doc.lines.map((line) => {
      const unitCents = line.quantity > 0 ? Math.round(line.lineTotalCents / line.quantity) : line.lineTotalCents;
      return {
        designation: line.label,
        quantity: line.unit ? `${formatQtyForPdf(line.quantity)} ${materialUnitLabel(line.unit)}` : formatQtyForPdf(line.quantity),
        unitPrice: eur(unitCents),
        vat: formatRateForPdf(line.vatRate),
        total: eur(line.lineTotalCents),
      };
    }),
    { hideVat: vatFranchise },
  );

  const t = computeInvoicePdfTotals(doc.lines);
  const multiRate = t.vatGroups.length > 1;
  const totals: TotalsRow[] = vatFranchise
    ? [{ label: isCreditNote ? "Total de l'avoir" : "Net à payer", value: eur(t.totalTtcCents), highlight: true }]
    : [
    { label: "Total HT", value: eur(t.totalHtCents), strong: true },
    ...t.vatGroups.map((g) => ({
      label: multiRate ? `TVA ${formatRateForPdf(g.rate)} sur ${eur(g.baseCents)}` : `TVA ${formatRateForPdf(g.rate)}`,
      value: eur(g.taxCents),
    })),
    { label: isCreditNote ? "Total TTC de l'avoir" : "Net à payer TTC", value: eur(t.totalTtcCents), highlight: true },
  ];
  const exemptions = [...new Set(t.vatGroups.map((g) => g.exemptionReason).filter((r): r is string => Boolean(r)))];
  out.drawTotals(totals, ["Montants exprimés en euros.", ...exemptions]);

  // Point 5 audit pré-pilote : conditions de règlement.
  if (!isCreditNote && (doc.dueDate || doc.paymentTermsDays)) {
    out.callout([
      {
        text: doc.dueDate
          ? `À régler avant le ${formatDateForPdf(doc.dueDate)}`
          : `Paiement à ${doc.paymentTermsDays} jours`,
        bold: true,
      },
      ...(doc.paymentTermsDays ? [{ text: `Conditions de règlement : paiement à ${doc.paymentTermsDays} jours.` }] : []),
    ]);
  }

  if (doc.notes?.trim()) {
    out.sectionTitle("Notes");
    out.paragraph(doc.notes.trim(), { size: 8.5 });
    out.gap(8);
  }

  if (doc.legalMentions?.length) {
    out.sectionTitle("Mentions légales");
    for (const line of doc.legalMentions) out.paragraph(line, { size: 7, lineGap: 9 });
  }

  const title = `${label} ${doc.invoiceNumber}`;
  out.pdf.setTitle(title);
  out.pdf.setAuthor(s.name);
  out.pdf.setSubject(title);
  out.pdf.setCreator("Soline");
  out.pdf.setProducer("Soline Factur-X");
  out.pdf.setCreationDate(doc.issueDate);
  out.pdf.setModificationDate(doc.issueDate);

  return out.finalize({
    footerLeft: [s.name, s.siret ? `SIRET ${s.siret}` : null].filter(Boolean).join(" · "),
    documentRef: title,
  });
}
