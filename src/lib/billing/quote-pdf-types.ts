import type { ArtisanLegalProfile } from "@/lib/billing/legal-mentions";
import type { QuoteRetractionNotice } from "@/lib/billing/quote-pdf-legal";

export type QuotePdfTableLine = {
  designation: string;
  detail?: string;
  quantity: number;
  quantityLabel: string;
  unitPriceCents: number;
  vatRate: number;
  lineTotalCents: number;
};

export type QuoteVatBreakdownRow = {
  rate: number;
  baseHtCents: number;
  vatCents: number;
};

export type QuotePdfDocument = {
  quoteNumber: string;
  issueDate: Date;
  validUntil: Date;
  paymentTermsDays: number;
  defaultVatRate: number;
  seller: ArtisanLegalProfile & {
    addressLine1?: string | null;
    addressLine2?: string | null;
    postalCode?: string | null;
    city?: string | null;
    phone?: string | null;
    email?: string | null;
    logoUrl?: string | null;
    logoBytes?: Uint8Array | null;
    /** Couleur d'accent de l'artisan (#RRGGBB), reprise sur le document. */
    accentColor?: string | null;
  };
  buyer: {
    name: string;
    email?: string | null;
    addressLine1?: string | null;
    postalCode?: string | null;
    city?: string | null;
  };
  tableLines: QuotePdfTableLine[];
  vatBreakdown: QuoteVatBreakdownRow[];
  totalHtCents: number;
  totalVatCents: number;
  totalTtcCents: number;
  notes?: string | null;
  workSiteAddress?: string | null;
  generateVatAttestation?: boolean;
  legalFooterLines: string[];
  legalWarnings: string[];
  retractionNotice: QuoteRetractionNotice;
  /** CGV propres de l'artisan (clients finaux), une ligne par paragraphe. */
  salesTermsLines: string[];
  /** Franchise en base de TVA (art. 293 B) : toutes les lignes à 0 %. */
  vatFranchise?: boolean;
  /** Acceptation enregistrée (devis accepté) : remplace le cadre de signature vierge. */
  acceptance?: {
    signedAt: Date;
    signerName: string;
    channel: string | null;
    documentHash: string | null;
  } | null;
  /** Fournitures recommandées en achat direct (hors total TTC). */
  directPurchaseLines: QuotePdfDirectPurchaseLine[];
};

export type QuotePdfDirectPurchaseLine = {
  label: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  supplierUrl?: string | null;
};
