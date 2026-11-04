import { computeInvoiceTotals } from "../invoice-amounts";
import type { FacturXInvoiceDocument } from "@/lib/billing/facturx/types";

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
  const { vatGroups, totalHtCents: lineTotalCents, totalVatCents: taxTotalCents, totalTtcCents } =
    computeInvoiceTotals(document.lines);
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
      grandTotalCents: totalTtcCents,
    },
    vatBreakdown: vatGroups.map((g) => ({ rate: g.rate, basisCents: g.baseCents, taxCents: g.taxCents, categoryCode: g.categoryCode })),
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

/** Lot e-reporting transmis à la PA (Flux 10 — transactions B2C). */
export type EReportingBatchPayload = {
  schemaVersion: "1.1";
  artisanId: string;
  reportingPeriod: string;
  transactionCount: number;
  transactions: EReportingPayload[];
  submittedAt: string;
};

export function buildEReportingBatchPayload(
  artisanId: string,
  reportingPeriod: string,
  transactions: EReportingPayload[],
): EReportingBatchPayload {
  return {
    schemaVersion: "1.1",
    artisanId,
    reportingPeriod,
    transactionCount: transactions.length,
    transactions,
    submittedAt: new Date().toISOString(),
  };
}

type QueueRow = {
  id: string;
  artisan_id: string;
  reporting_period: string | null;
  payload: EReportingPayload;
};

/** Regroupe les lignes pending par artisan + période. */
export function groupEReportingQueueRows(rows: QueueRow[]): Map<string, { artisanId: string; period: string; rows: QueueRow[] }> {
  const groups = new Map<string, { artisanId: string; period: string; rows: QueueRow[] }>();

  for (const row of rows) {
    const period = row.reporting_period ?? reportingPeriodFromDate(new Date());
    const key = `${row.artisan_id}:${period}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      groups.set(key, { artisanId: row.artisan_id, period, rows: [row] });
    }
  }

  return groups;
}
