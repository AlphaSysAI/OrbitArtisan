import "server-only";

import { MISTRAL_EXTRACTION_MODEL, mistralChat, mistralOcr, parseJsonFromLlm } from "@/lib/ai/mistral";
import { frenchVatFromSiren } from "@/lib/onboarding/identifiers";
import { lookupCompanyBySiret, type RegistryCompany } from "@/lib/onboarding/company-registry";
import {
  QUOTE_EXTRACTION_JSON_SCHEMA,
  QUOTE_EXTRACTION_SYSTEM_PROMPT,
  quoteExtractionSchema,
  type QuoteExtraction,
} from "@/lib/onboarding/quote-import-schema";
import {
  inferVatRegime,
  LEGAL_KEYS,
  mergeVerifiedDocuments,
  verifyExtraction,
  type CatalogCandidate,
  type LegalKey,
  type VerifiedDocument,
  type VerifiedField,
} from "@/lib/onboarding/verify-extraction";

export const IMPORT_MAX_BYTES = 4 * 1024 * 1024; // < limite de corps Vercel (4,5 Mo)

export function detectDocumentMime(bytes: Uint8Array): "application/pdf" | "image/jpeg" | "image/png" | null {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  return null;
}

async function extract(ocrText: string): Promise<QuoteExtraction> {
  const messages = [
    { role: "system" as const, content: QUOTE_EXTRACTION_SYSTEM_PROMPT },
    { role: "user" as const, content: `TEXTE OCR DU DOCUMENT :\n<<<\n${ocrText}\n>>>` },
  ];
  // Schéma strict d'abord ; repli JSON libre + validation Zod si le fournisseur refuse le schéma.
  const attempts = [
    { type: "json_schema" as const, name: "quote_extraction", schema: QUOTE_EXTRACTION_JSON_SCHEMA as unknown as Record<string, unknown>, strict: true },
    "json_object" as const,
  ];
  let last: unknown = null;
  for (const responseFormat of attempts) {
    try {
      const raw = await mistralChat({
        model: MISTRAL_EXTRACTION_MODEL,
        messages:
          responseFormat === "json_object"
            ? [...messages, { role: "system", content: `Réponds UNIQUEMENT par un objet JSON conforme à ce schéma :\n${JSON.stringify(QUOTE_EXTRACTION_JSON_SCHEMA)}` }]
            : messages,
        temperature: 0,
        maxTokens: 6000,
        responseFormat,
        timeoutMs: 45_000,
      });
      const parsed = quoteExtractionSchema.safeParse(parseJsonFromLlm(raw));
      if (parsed.success) return parsed.data;
      last = parsed.error;
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error("extraction_failed");
}

/**
 * Un document → OCR → extraction → vérification. Le fichier n'est JAMAIS stocké :
 * il contient les données personnelles des anciens clients de l'artisan.
 */
export async function analyzeQuoteDocument(bytes: Uint8Array): Promise<VerifiedDocument> {
  const mime = detectDocumentMime(bytes);
  if (!mime) throw new Error("unsupported_file");
  const text = await mistralOcr(bytes, mime);
  if (text.replace(/\s/g, "").length < 40) {
    return verifyExtraction(emptyExtraction(), "");
  }
  const extraction = await extract(text);
  return verifyExtraction(extraction, text);
}

function emptyExtraction(): QuoteExtraction {
  const n = { value: null, evidence: null, confidence: "low" as const };
  return {
    document_kind: "other",
    readable: false,
    company: { business_name: n, siret: n, vat_number: n, vat_franchise_mention: n, trade_register: n, address_line1: n, postal_code: n, city: n, phone: n, email: n },
    insurance: { decennale_insurer: n, decennale_policy_number: n, decennale_coverage_area: n, rc_pro_insurer: n, rc_pro_number: n },
    mediator: { name: n, url: n },
    payment_terms_days: n,
    lines: [],
  };
}

export type ReviewField = VerifiedField & { source: "document" | "registry" | "computed" | null };

export type VatRegime = "normal" | "franchise";

export type ImportReview = {
  readableCount: number;
  /**
   * Régime de TVA constaté sur les devis : mention 293 B vérifiée → franchise ;
   * n° de TVA lu ou TVA facturée → normal ; indices contradictoires ou absents → null (on demande).
   */
  vatRegime: { value: VatRegime | null; reason: "document" | "conflict" | "unknown" };
  fields: Record<LegalKey | "first_name" | "last_name", ReviewField>;
  registry: Pick<RegistryCompany, "name" | "active"> | null;
  vatFranchise: boolean;
  lines: CatalogCandidate[];
};

/**
 * Fusion des documents analysés + données officielles. Priorité : registre
 * officiel > document vérifié > vide (à demander). Jamais de déduction LLM.
 */
export async function buildImportReview(docs: VerifiedDocument[]): Promise<ImportReview> {
  const merged = mergeVerifiedDocuments(docs);
  const fields = Object.fromEntries(
    LEGAL_KEYS.map((k) => [k, { ...merged.legal[k], source: merged.legal[k].status === "verified" ? "document" : null }]),
  ) as ImportReview["fields"];
  fields.first_name = { value: null, status: "missing", source: null };
  fields.last_name = { value: null, status: "missing", source: null };

  const vatRegime: ImportReview["vatRegime"] = inferVatRegime(merged);

  const siret = fields.siret.status === "verified" ? fields.siret.value : null;
  const registry = siret ? await lookupCompanyBySiret(siret) : null;
  if (registry) {
    const fill = (key: keyof ImportReview["fields"], value: string | null) => {
      if (value && fields[key].status !== "verified") fields[key] = { value, status: "verified", source: "registry" };
    };
    fill("business_name", registry.name);
    fill("address_line1", registry.addressLine1);
    fill("postal_code", registry.postalCode);
    fill("city", registry.city);
    fill("first_name", registry.firstName);
    fill("last_name", registry.lastName);
    // TVA intracom : calcul officiel depuis le SIREN confirmé par le registre (pas une déduction du modèle).
    // Uniquement si l'entreprise facture la TVA : en franchise, pas de n° à imprimer d'office.
    if (fields.vat_number.status !== "verified" && vatRegime.value === "normal") {
      const vat = frenchVatFromSiren(registry.siren);
      if (vat) fields.vat_number = { value: vat, status: "verified", source: "computed" };
    }
  } else if (siret) {
    // SIRET bien formé mais inconnu du registre (ou API indisponible) : l'artisan confirme.
    fields.siret = { value: siret, status: "unreadable", source: "document" };
  }

  return {
    readableCount: merged.readableCount,
    vatRegime,
    fields,
    registry: registry ? { name: registry.name, active: registry.active } : null,
    vatFranchise: merged.vatFranchise,
    lines: merged.lines,
  };
}
