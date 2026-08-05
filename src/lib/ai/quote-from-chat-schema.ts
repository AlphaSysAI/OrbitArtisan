import { z } from "zod";

function coerceNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v ?? "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function coercePositiveInt(v: unknown): number {
  return Math.max(1, Math.round(coerceNumber(v)));
}

function coerceString(v: unknown): string {
  return String(v ?? "").trim();
}

function coerceNullableString(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v).trim() || null;
}

export const QuoteExtractionSchema = z.object({
  labor_items: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(
      z.object({
        description: z.preprocess(coerceString, z.string()),
        quantity: z.preprocess(coerceNumber, z.number()),
        unit_price: z.preprocess(coerceNumber, z.number()),
      }),
    ),
  ),
  catalog_service_titles: z.preprocess(
    (v) => (Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : []),
    z.array(z.string()),
  ),
  needed_materials: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(
      z.object({
        name_generic: z.preprocess(coerceString, z.string()),
        quantity: z.preprocess(coercePositiveInt, z.number().int().positive()),
        specifications: z.preprocess(coerceNullableString, z.string().nullable()),
      }),
    ),
  ),
  notes: z.preprocess(coerceString, z.string()),
});

export type QuoteExtraction = z.infer<typeof QuoteExtractionSchema>;

/** Schéma JSON simplifié (draft-07) compatible Mistral `json_schema`. */
export const QUOTE_EXTRACTION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    labor_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: "number", description: "Heures de main d'œuvre" },
          unit_price: { type: "number", description: "Taux horaire en euros" },
        },
        required: ["description", "quantity", "unit_price"],
      },
    },
    catalog_service_titles: {
      type: "array",
      items: { type: "string" },
    },
    needed_materials: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name_generic: { type: "string" },
          quantity: { type: "number" },
          specifications: { type: "string" },
        },
        required: ["name_generic", "quantity"],
      },
    },
    notes: { type: "string" },
  },
  required: ["labor_items", "catalog_service_titles", "needed_materials", "notes"],
};

export type MatchedSupplierMaterial = {
  requested_name: string;
  quantity: number;
  specifications: string | null;
  match: {
    id: string;
    title: string;
    price_eur: number;
    url: string;
    sku: string;
    similarity: number;
  } | null;
};

export type GenerateQuoteFromChatResponse = {
  labor_items: QuoteExtraction["labor_items"];
  catalog_service_titles: string[];
  matched_service_ids: string[];
  labor_duration_minutes: number;
  notes: string;
  supplier_materials: MatchedSupplierMaterial[];
  warnings: string[];
};
