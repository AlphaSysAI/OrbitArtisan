import type { InvoiceOperationType, VatCollectionNature } from "@/lib/billing/einvoicing-types";

/** Profil Factur-X cible. */
export type FacturXProfile = "basic" | "en16931";

/** Partie (émetteur ou client) pour la génération Factur-X. */
export type FacturXParty = {
  name: string;
  siren?: string | null;
  siret?: string | null;
  vatNumber?: string | null;
  nafCode?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  countryCode?: string | null;
  tradeRegisterNumber?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type FacturXLineInput = {
  lineNumber: number;
  label: string;
  quantity: number;
  /** Montant ligne HT en centimes */
  lineTotalCents: number;
  vatRate: number;
  vatCategoryCode: string;
  vatExemptionReason?: string | null;
};

/** Document facture prêt pour la génération CII / PDF Factur-X. */
export type FacturXInvoiceDocument = {
  invoiceNumber: string;
  issueDate: Date;
  currency?: "EUR";
  seller: FacturXParty;
  buyer: FacturXParty;
  lines: FacturXLineInput[];
  notes?: string | null;
  operationType?: InvoiceOperationType;
  vatCollectionNature?: VatCollectionNature;
  vatOnDebits?: boolean;
};

export type FacturXGenerationOptions = {
  profile?: FacturXProfile;
  /** Valide le XML contre le XSD Factur-X avant embarquement (défaut: true). */
  validateXml?: boolean;
  language?: string;
};

export type FacturXGenerationResult = {
  pdf: Uint8Array;
  xml: string;
  profile: FacturXProfile;
  filename: "factur-x.xml";
};

export class FacturXValidationError extends Error {
  constructor(
    message: string,
    readonly errors: unknown[] = [],
  ) {
    super(message);
    this.name = "FacturXValidationError";
  }
}
