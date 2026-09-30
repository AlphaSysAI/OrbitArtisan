import { rgb } from "pdf-lib";

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
import type { QuotePdfDocument } from "@/lib/billing/quote-pdf-types";

export type { QuotePdfDocument } from "@/lib/billing/quote-pdf-types";

const WARNING = rgb(0.6, 0.36, 0.05);
const MUTED = rgb(0.42, 0.45, 0.5);

/**
 * Devis PDF. Présentation uniquement : lignes, ventilation TVA et totaux sont
 * calculés en amont (load-quote-pdf / build-quote-pdf-lines) et affichés tels quels.
 */
export async function renderQuotePdf(doc: QuotePdfDocument): Promise<Uint8Array> {
  const out = await CommercialPdf.create(resolvePdfTheme(doc.seller.accentColor));
  const logo = await embedLogoImage(out.pdf, doc.seller.logoBytes);
  const s = doc.seller;

  out.drawHeader({
    logo,
    sellerName: s.business_name,
    sellerLines: [
      s.name && s.name !== s.business_name ? s.name : null,
      s.addressLine1,
      [s.postalCode, s.city].filter(Boolean).join(" ") || null,
      s.phone ? `Tél. ${s.phone}` : null,
      s.email,
    ].filter((l): l is string => Boolean(l?.trim())),
    sellerLegal: [
      s.siret ? `SIRET ${s.siret}` : s.siren ? `SIREN ${s.siren}` : null,
      s.vat_number ? `TVA ${s.vat_number}` : null,
    ].filter((l): l is string => Boolean(l)),
    title: "DEVIS",
    number: doc.quoteNumber,
    meta: [
      ["Date", formatDateForPdf(doc.issueDate)],
      ["Valable jusqu'au", formatDateForPdf(doc.validUntil)],
    ],
  });

  out.drawParties({
    left: doc.workSiteAddress?.trim() ? { label: "Lieu d'intervention", lines: [doc.workSiteAddress.trim()] } : null,
    right: {
      label: "Client",
      lines: [
        doc.buyer.name,
        doc.buyer.addressLine1,
        [doc.buyer.postalCode, doc.buyer.city].filter(Boolean).join(" ") || null,
        doc.buyer.email,
      ].filter((l): l is string => Boolean(l?.trim())),
    },
  });

  out.sectionTitle("Détail des prestations et fournitures");
  out.drawTable(
    doc.tableLines.map((line) => ({
      designation: line.designation,
      detail: line.detail,
      quantity: `${formatQtyForPdf(line.quantity)} ${line.quantityLabel}`.trim(),
      unitPrice: formatEurosForPdf(line.unitPriceCents),
      vat: formatRateForPdf(line.vatRate),
      total: formatEurosForPdf(line.lineTotalCents),
    })),
  );

  const multiRate = doc.vatBreakdown.length > 1;
  const totals: TotalsRow[] = [
    { label: "Total HT", value: formatEurosForPdf(doc.totalHtCents), strong: true },
    ...doc.vatBreakdown.map((row) => ({
      label: multiRate
        ? `TVA ${formatRateForPdf(row.rate)} sur ${formatEurosForPdf(row.baseHtCents)}`
        : `TVA ${formatRateForPdf(row.rate)}`,
      value: formatEurosForPdf(row.vatCents),
    })),
    { label: "Total TTC", value: formatEurosForPdf(doc.totalTtcCents), highlight: true },
  ];
  out.drawTotals(totals, ["Montants exprimés en euros."]);

  if (doc.directPurchaseLines.length > 0) {
    out.sectionTitle("Fournitures en achat direct (hors total ci-dessus)");
    out.paragraph("Prix indicatifs catalogue, à régler directement auprès du fournisseur.", { size: 7.5, color: MUTED });
    out.gap(2);
    for (const line of doc.directPurchaseLines) {
      out.paragraph(
        `•  ${line.label} : ${formatQtyForPdf(line.quantity)} × ${formatEurosForPdf(line.unitPriceCents)} HT = ${formatEurosForPdf(line.lineTotalCents)} HT`,
        { size: 8 },
      );
    }
    out.gap(8);
  }

  if (doc.notes?.trim()) {
    out.sectionTitle("Observations");
    out.paragraph(doc.notes.trim(), { size: 8.5 });
    out.gap(8);
  }

  out.signatureBlock({
    title: "Bon pour accord",
    lines: ["Mention manuscrite : « Lu et approuvé, devis reçu avant exécution des travaux », date et signature."],
  });

  out.sectionTitle(doc.retractionNotice.heading);
  for (const line of doc.retractionNotice.body) out.paragraph(line, { size: 7.5, lineGap: 10 });
  out.gap(6);

  for (const warning of doc.legalWarnings) out.paragraph(warning, { size: 7, color: WARNING });

  if (doc.salesTermsLines.length > 0) {
    out.sectionTitle("Conditions générales de vente");
    for (const line of doc.salesTermsLines) out.paragraph(line, { size: 7, lineGap: 9 });
    out.gap(6);
  }

  out.sectionTitle("Mentions légales");
  for (const line of doc.legalFooterLines) out.paragraph(line, { size: 7, color: MUTED, lineGap: 9 });

  out.pdf.setTitle(`Devis ${doc.quoteNumber}`);
  out.pdf.setAuthor(s.business_name);
  out.pdf.setCreator("Soline");
  out.pdf.setCreationDate(doc.issueDate);

  return out.finalize({
    footerLeft: [s.business_name, s.siret ? `SIRET ${s.siret}` : null].filter(Boolean).join(" · "),
    documentRef: `Devis ${doc.quoteNumber}`,
  });
}
