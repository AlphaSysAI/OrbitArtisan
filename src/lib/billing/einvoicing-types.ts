/**
 * Types et constantes pour la facturation électronique EN16931 / Factur-X (2026).
 * Alignés sur supabase/init.sql (section facturation électronique)
 */

/** Nature globale de l'opération facturée. */
export const INVOICE_OPERATION_TYPES = [
  "livraison_biens",
  "prestation_services",
  "mixte",
] as const;

export type InvoiceOperationType = (typeof INVOICE_OPERATION_TYPES)[number];

/** Exigibilité de la TVA (livraison vs encaissement). */
export const VAT_COLLECTION_NATURES = ["on_delivery", "on_payment"] as const;

export type VatCollectionNature = (typeof VAT_COLLECTION_NATURES)[number];

/** Statut du flux e-invoicing (PDP / PPF), distinct du statut métier app. */
const E_INVOICING_STATUSES = [
  "DRAFT",
  "DEPOSITED",
  "RECEIVED_BY_PLATFORM",
  "TRANSMITTED",
  "APPROVED",
  "REJECTED",
  "PAID",
] as const;

type EInvoicingStatus = (typeof E_INVOICING_STATUSES)[number];

/**
 * Codes catégorie TVA (UN/ECE 5305 / Factur-X).
 * S = standard, AA = taux réduit rénovation, E = exonéré, Z = taux zéro.
 */
const VAT_CATEGORY_CODES = ["S", "AA", "E", "Z", "K", "G"] as const;

type VatCategoryCode = (typeof VAT_CATEGORY_CODES)[number];

/** Ligne de facture avec TVA explicite. */
type InvoiceLineVatFields = {
  vat_rate: number;
  vat_exemption_reason: string | null;
  vat_category_code: VatCategoryCode | string;
};

/** Facture avec champs e-invoicing. */
type InvoiceEinvoicingFields = {
  operation_type: InvoiceOperationType;
  vat_on_debits: boolean;
  vat_collection_nature: VatCollectionNature;
  e_invoicing_status: EInvoicingStatus;
};

/** Valeurs par défaut pour une nouvelle facture artisan (prestations). */
export const DEFAULT_INVOICE_EINVOICING: InvoiceEinvoicingFields = {
  operation_type: "prestation_services",
  vat_on_debits: false,
  vat_collection_nature: "on_delivery",
  e_invoicing_status: "DRAFT",
};

/**
 * Point 3 audit pré-pilote : construit les champs TVA d'une ligne de facture
 * à partir d'un taux réel (5.5 / 10 / 20), au lieu du DEFAULT_INVOICE_LINE_VAT
 * fixe à 20 %. AA = catégorie "taux réduit rénovation" (UN/ECE 5305), retenue
 * pour 5.5 et 10 — S pour le taux normal et tout taux non reconnu (repli sûr).
 */
export function vatFieldsForRate(rate: number | null | undefined): InvoiceLineVatFields {
  const r = typeof rate === "number" && Number.isFinite(rate) ? rate : 20;
  const isReduced = r === 5.5 || r === 10;
  return {
    vat_rate: r,
    vat_exemption_reason: null,
    vat_category_code: isReduced ? "AA" : "S",
  };
}
