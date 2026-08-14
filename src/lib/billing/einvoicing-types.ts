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
export const E_INVOICING_STATUSES = [
  "DRAFT",
  "DEPOSITED",
  "RECEIVED_BY_PLATFORM",
  "TRANSMITTED",
  "APPROVED",
  "REJECTED",
  "PAID",
] as const;

export type EInvoicingStatus = (typeof E_INVOICING_STATUSES)[number];

/** Taux TVA usuels en France (centimes non concernés — pourcentage). */
export const FR_VAT_RATES = [0, 2.1, 5.5, 10, 20] as const;

export type FrVatRate = (typeof FR_VAT_RATES)[number];

/**
 * Codes catégorie TVA (UN/ECE 5305 / Factur-X).
 * S = standard, AA = taux réduit rénovation, E = exonéré, Z = taux zéro.
 */
export const VAT_CATEGORY_CODES = ["S", "AA", "E", "Z", "K", "G"] as const;

export type VatCategoryCode = (typeof VAT_CATEGORY_CODES)[number];

export const VAT_CATEGORY_LABELS: Record<VatCategoryCode, string> = {
  S: "Taux normal",
  AA: "Taux réduit (rénovation)",
  E: "Exonéré",
  Z: "Taux zéro",
  K: "Autoliquidation",
  G: "Export hors UE",
};

/** Champs légaux B2B partagés par émetteur (profiles) et client (customer_profiles). */
export type LegalEntityFields = {
  siren: string | null;
  siret: string | null;
  vat_number: string | null;
  naf_code: string | null;
  /** Voie */
  address_line1: string | null;
  /** Complément d'adresse */
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  /** Code pays ISO 3166-1 alpha-2 (ex. FR) */
  country_code: string;
  /** Immatriculation RCS ou RM */
  trade_register_number: string | null;
};

/** Profil artisan — champs légaux en complément du profil métier. */
export type ProfileLegalEntity = LegalEntityFields & {
  id: string;
  business_name: string;
  phone: string | null;
};

/** Profil client B2B. */
export type CustomerProfileLegalEntity = LegalEntityFields & {
  user_id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
};

/** Statut métier interne (paiement / envoi), conservé pour compatibilité app. */
export type InvoiceAppStatus = "draft" | "sent" | "paid";

/** Ligne de facture avec TVA explicite. */
export type InvoiceLineVatFields = {
  vat_rate: number;
  vat_exemption_reason: string | null;
  vat_category_code: VatCategoryCode | string;
};

export type InvoiceLineRow = InvoiceLineVatFields & {
  id: string;
  invoice_id: string;
  line_kind: "labor" | "service" | "material";
  label: string;
  quantity: number | null;
  unit_price: number | null;
  line_total: number;
  sort_order: number;
  created_at: string;
};

/** Facture avec champs e-invoicing. */
export type InvoiceEinvoicingFields = {
  operation_type: InvoiceOperationType;
  vat_on_debits: boolean;
  vat_collection_nature: VatCollectionNature;
  e_invoicing_status: EInvoicingStatus;
};

export type InvoiceRow = InvoiceEinvoicingFields & {
  id: string;
  artisan_id: string;
  quote_id: string;
  customer_user_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  invoice_number: string | null;
  /** Statut métier app (draft / sent / paid) */
  status: InvoiceAppStatus;
  labor_total: number;
  materials_total: number;
  grand_total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** Valeurs par défaut pour une nouvelle facture artisan (prestations). */
export const DEFAULT_INVOICE_EINVOICING: InvoiceEinvoicingFields = {
  operation_type: "prestation_services",
  vat_on_debits: false,
  vat_collection_nature: "on_delivery",
  e_invoicing_status: "DRAFT",
};

/** TVA par défaut sur une ligne (prestation BTP en France). */
export const DEFAULT_INVOICE_LINE_VAT: InvoiceLineVatFields = {
  vat_rate: 20,
  vat_exemption_reason: null,
  vat_category_code: "S",
};

export function isInvoiceOperationType(value: string): value is InvoiceOperationType {
  return (INVOICE_OPERATION_TYPES as readonly string[]).includes(value);
}

export function isEInvoicingStatus(value: string): value is EInvoicingStatus {
  return (E_INVOICING_STATUSES as readonly string[]).includes(value);
}

export function isVatCollectionNature(value: string): value is VatCollectionNature {
  return (VAT_COLLECTION_NATURES as readonly string[]).includes(value);
}
