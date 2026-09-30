import { z } from "zod";

/**
 * Extraction structurée d'un ancien devis/facture d'artisan (onboarding « zéro saisie »).
 *
 * Chaque information légale est un triplet { value, evidence, confidence } :
 * - evidence = copie EXACTE (caractère pour caractère) du passage du document qui la contient ;
 * - le serveur vérifie ensuite que ce passage existe bien dans le texte OCR et
 *   qu'il contient la valeur (verify-extraction.ts). Sans preuve vérifiable → null.
 */

const confidence = z.enum(["high", "low"]);

const textField = z.object({
  value: z.string().nullable(),
  evidence: z.string().nullable(),
  confidence,
});

const numberField = z.object({
  value: z.number().nullable(),
  evidence: z.string().nullable(),
  confidence,
});

export const EXTRACTED_UNITS = ["m²", "ml", "m³", "U", "forfait", "h", "jour"] as const;

export const extractedLineSchema = z.object({
  label: z.string(),
  unit: z.enum(EXTRACTED_UNITS).nullable(),
  unit_price_ht: z.number().nullable(),
  vat_rate: z.union([z.literal(5.5), z.literal(10), z.literal(20)]).nullable(),
  evidence: z.string().nullable(),
  confidence,
});

export const quoteExtractionSchema = z.object({
  document_kind: z.enum(["quote", "invoice", "other"]),
  readable: z.boolean(),
  company: z.object({
    business_name: textField,
    siret: textField,
    vat_number: textField,
    vat_franchise_mention: textField,
    trade_register: textField,
    address_line1: textField,
    postal_code: textField,
    city: textField,
    phone: textField,
    email: textField,
  }),
  insurance: z.object({
    decennale_insurer: textField,
    decennale_policy_number: textField,
    decennale_coverage_area: textField,
    rc_pro_insurer: textField,
    rc_pro_number: textField,
  }),
  mediator: z.object({
    name: textField,
    url: textField,
  }),
  payment_terms_days: numberField,
  lines: z.array(extractedLineSchema).max(80),
});

export type QuoteExtraction = z.infer<typeof quoteExtractionSchema>;
export type ExtractedTextField = z.infer<typeof textField>;
export type ExtractedLine = z.infer<typeof extractedLineSchema>;

const jsonTextField = {
  type: "object",
  additionalProperties: false,
  required: ["value", "evidence", "confidence"],
  properties: {
    value: { type: ["string", "null"] },
    evidence: { type: ["string", "null"] },
    confidence: { type: "string", enum: ["high", "low"] },
  },
} as const;

const jsonNumberField = {
  ...jsonTextField,
  properties: { ...jsonTextField.properties, value: { type: ["number", "null"] } },
} as const;

function group(keys: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: keys,
    properties: Object.fromEntries(keys.map((k) => [k, jsonTextField])),
  };
}

/** JSON Schema strict envoyé au modèle (response_format json_schema, strict: true). */
export const QUOTE_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["document_kind", "readable", "company", "insurance", "mediator", "payment_terms_days", "lines"],
  properties: {
    document_kind: { type: "string", enum: ["quote", "invoice", "other"] },
    readable: { type: "boolean" },
    company: group([
      "business_name",
      "siret",
      "vat_number",
      "vat_franchise_mention",
      "trade_register",
      "address_line1",
      "postal_code",
      "city",
      "phone",
      "email",
    ]),
    insurance: group([
      "decennale_insurer",
      "decennale_policy_number",
      "decennale_coverage_area",
      "rc_pro_insurer",
      "rc_pro_number",
    ]),
    mediator: group(["name", "url"]),
    payment_terms_days: jsonNumberField,
    lines: {
      type: "array",
      maxItems: 80,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "unit", "unit_price_ht", "vat_rate", "evidence", "confidence"],
        properties: {
          label: { type: "string" },
          unit: { type: ["string", "null"], enum: [...EXTRACTED_UNITS, null] },
          unit_price_ht: { type: ["number", "null"] },
          vat_rate: { type: ["number", "null"], enum: [5.5, 10, 20, null] },
          evidence: { type: ["string", "null"] },
          confidence: { type: "string", enum: ["high", "low"] },
        },
      },
    },
  },
} as const;

/** Prompt système d'extraction. Toute modification doit garder la règle « null plutôt que deviner ». */
export const QUOTE_EXTRACTION_SYSTEM_PROMPT = `Tu es un extracteur de données pour un logiciel de facturation d'artisans du bâtiment (France).
On te donne le texte OCR (Markdown) d'UN ancien devis ou d'UNE ancienne facture émis(e) PAR l'artisan.
Tu remplis le schéma JSON fourni. Tu ne rédiges rien d'autre.

RÈGLE ABSOLUE — ZÉRO INVENTION SUR LES INFORMATIONS LÉGALES
(entreprise, SIRET, TVA, RCS/RM, adresse, téléphone, e-mail, assurances, médiateur, délai de paiement) :
1. "value" ne peut contenir QUE ce qui est écrit dans le document. Tu ne complètes jamais un numéro,
   tu ne déduis rien (pas de TVA calculée depuis le SIREN, pas d'assureur « probable », pas de ville
   déduite du code postal, pas de zone de couverture « France » par défaut).
2. "evidence" = copie EXACTE, caractère pour caractère, du court passage (une ligne, 200 caractères max)
   où figure la valeur. Si tu ne peux pas citer ce passage mot pour mot, value = null.
3. Illisible, tronqué, coupé par un pli ou un tampon, ambigu (deux valeurs possibles), ou absent
   → value = null, evidence = null, confidence = "low". Ne jamais « corriger » un chiffre douteux.
4. confidence = "high" uniquement si la valeur est entière, nette et sans ambiguïté. Sinon "low".
5. Les coordonnées du CLIENT (destinataire du devis) ne sont JAMAIS celles de l'entreprise.
   L'entreprise est l'émettrice : en-tête, pied de page, mentions légales.
6. SIRET : 14 chiffres (espaces tolérés). Un SIREN seul (9 chiffres) n'est pas un SIRET → siret = null.
7. vat_franchise_mention : recopie la mention « TVA non applicable, art. 293 B du CGI » si elle figure, sinon null.
8. decennale_coverage_area : zone géographique de couverture de l'assurance décennale telle qu'écrite
   (ex. « France métropolitaine »). Absente → null.
9. payment_terms_days : nombre de jours seulement si un délai en jours est écrit (« paiement à 30 jours » → 30).
   « À réception » → 0. Rien d'écrit → null.

LIGNES DE PRESTATION (catalogue de l'artisan) :
- Une entrée par ligne chiffrée du devis. "label" = libellé exact de la ligne (sans la quantité ni le prix).
- "unit" parmi : m², ml, m³, U, forfait, h, jour. Correspondances : « m2 »→m², « mètre linéaire »/« ml »→ml,
  « u », « unité », « pce »→U, « ens », « forfait », « ft »→forfait, « heure »/« h »→h, « jour »/« j »→jour.
  Unité absente ou différente → null.
- "unit_price_ht" = prix unitaire HORS TAXES en euros (nombre, point décimal). Si seul un prix TTC figure, null.
- "vat_rate" = 5.5, 10 ou 20 uniquement si le taux de la ligne (ou le taux unique du document) est écrit. Sinon null.
- "evidence" = la ligne du tableau recopiée telle quelle.
- Ignore les lignes de sous-total, total, acompte, remise, frais de déplacement offerts.

Si le document n'est pas un devis/une facture d'artisan, ou est illisible : document_kind = "other",
readable = false, toutes les valeurs null, lines = [].`;
