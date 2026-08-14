import type { FacturXInvoiceDocument } from "@/lib/billing/facturx/types";

/** Statuts file e-reporting (alignés supabase/init.sql). */
export type EReportingQueueStatus = "pending" | "batched" | "submitted" | "failed";

export type EReportingVatLine = {
  rate: number;
  basisCents: number;
  taxCents: number;
  categoryCode: string;
};

/** Métadonnées de vente B2C pour transmission groupée (e-reporting). */
export type EReportingPayload = {
  schemaVersion: "1.0";
  invoiceId: string;
  invoiceNumber: string;
  issueDate: string;
  currency: "EUR";
  seller: {
    name: string;
    siret: string | null;
    siren: string | null;
    vatNumber: string | null;
    countryCode: string;
  };
  buyer: {
    name: string;
    email: string | null;
    countryCode: string;
  };
  totals: {
    lineTotalCents: number;
    taxTotalCents: number;
    grandTotalCents: number;
  };
  vatBreakdown: EReportingVatLine[];
  operationType: string | null;
  vatCollectionNature: string | null;
};

export function buildEReportingPayload(document: FacturXInvoiceDocument, invoiceId: string): EReportingPayload {
  const vatMap = new Map<string, EReportingVatLine>();

  for (const line of document.lines) {
    const taxCents = Math.round((line.lineTotalCents * line.vatRate) / 100);
    const key = `${line.vatCategoryCode}:${line.vatRate}`;
    const existing = vatMap.get(key);

    if (existing) {
      existing.basisCents += line.lineTotalCents;
      existing.taxCents += taxCents;
    } else {
      vatMap.set(key, {
        rate: line.vatRate,
        basisCents: line.lineTotalCents,
        taxCents,
        categoryCode: line.vatCategoryCode,
      });
    }
  }

  const lineTotalCents = document.lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const taxTotalCents = [...vatMap.values()].reduce((sum, row) => sum + row.taxCents, 0);

  return {
    schemaVersion: "1.0",
    invoiceId,
    invoiceNumber: document.invoiceNumber,
    issueDate: document.issueDate.toISOString(),
    currency: "EUR",
    seller: {
      name: document.seller.name,
      siret: document.seller.siret ?? null,
      siren: document.seller.siren ?? null,
      vatNumber: document.seller.vatNumber ?? null,
      countryCode: document.seller.countryCode ?? "FR",
    },
    buyer: {
      name: document.buyer.name,
      email: document.buyer.email ?? null,
      countryCode: document.buyer.countryCode ?? "FR",
    },
    totals: {
      lineTotalCents,
      taxTotalCents,
      grandTotalCents: lineTotalCents + taxTotalCents,
    },
    vatBreakdown: [...vatMap.values()],
    operationType: document.operationType ?? null,
    vatCollectionNature: document.vatCollectionNature ?? null,
  };
}

/** Période de déclaration (1er jour du mois d'émission). */
export function reportingPeriodFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}
