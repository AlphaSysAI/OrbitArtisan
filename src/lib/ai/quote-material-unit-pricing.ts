import "server-only";

import { z } from "zod";

import { mistralChatParse } from "@/lib/ai/mistral";
import { formatWebSearchForPrompt, searchWebForQuoteContext } from "@/lib/ai/web-search";

function normalizeMaterialKey(name: string): string {
  return name.trim().toLowerCase();
}

const MaterialUnitPricingSchema = z.object({
  items: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(
      z.object({
        name: z.string(),
        unit_price_ht_eur: z.preprocess(
          (v) => {
            const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
            return Number.isFinite(n) && n > 0 ? n : 0;
          },
          z.number(),
        ),
      }),
    ),
  ),
});

const JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          unit_price_ht_eur: { type: "number", description: "Prix unitaire HT en euros" },
        },
        required: ["name", "unit_price_ht_eur"],
      },
    },
  },
  required: ["items"],
};

export type MaterialToPrice = {
  name: string;
  quantity: number;
  specifications: string | null;
};

/**
 * Estime un prix unitaire HT (€) par matériau quand le catalogue fournisseur n'a pas de match.
 * Tavily (si configuré) + Mistral — fourchettes resserrées en prix unitaire médian.
 */
export async function estimateMaterialUnitPricesEur(
  materials: MaterialToPrice[],
  instructionContext: string,
): Promise<Map<string, number>> {
  const unique = materials.filter((m) => m.name.trim());
  if (!unique.length) return new Map();

  const query = [
    "prix unitaire HT fournitures BTP France",
    instructionContext.slice(0, 120),
    unique
      .slice(0, 6)
      .map((m) => m.name)
      .join(", "),
  ]
    .filter(Boolean)
    .join(" — ");

  const web = await searchWebForQuoteContext(query);
  const webBlock = web ? formatWebSearchForPrompt(web) : null;

  const lines = unique
    .map(
      (m) =>
        `- ${m.name} (qté ${m.quantity}${m.specifications ? `, ${m.specifications}` : ""})`,
    )
    .join("\n");

  try {
    const priced = await mistralChatParse(
      MaterialUnitPricingSchema,
      [
        {
          role: "system",
          content: `Tu estimes des prix unitaires HT en euros pour des fournitures BTP en France.
Règles :
- Un prix par ligne, cohérent avec le négoce / grande surface pro (pas de main-d'œuvre).
- Reprends exactement le même "name" que dans la liste utilisateur.
- Si incertain, propose un prix médian marché réaliste (jamais 0).`,
        },
        {
          role: "user",
          content: [
            instructionContext.trim() ? `Contexte chantier :\n${instructionContext.trim()}` : "",
            `Matériaux à chiffrer (prix unitaire HT, pas le total) :\n${lines}`,
            webBlock ? `Références web :\n${webBlock}` : "Pas de recherche web — prix marché France.",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      "quote_material_unit_pricing",
      {
        temperature: 0.2,
        jsonSchema: JSON_SCHEMA,
        jsonExample: `{"items":[{"name":"Mortier ciment","unit_price_ht_eur":8.5}]}`,
      },
    );

    const out = new Map<string, number>();
    for (const item of priced.items) {
      if (!item.name.trim() || item.unit_price_ht_eur <= 0) continue;
      out.set(normalizeMaterialKey(item.name), Math.round(item.unit_price_ht_eur * 100) / 100);
    }
    return out;
  } catch (err) {
    console.error("[quote-material-unit-pricing]", err instanceof Error ? err.message : err);
    return new Map();
  }
}

export function lookupEstimatedUnitPrice(
  map: Map<string, number>,
  requestedName: string,
): number | null {
  const direct = map.get(normalizeMaterialKey(requestedName));
  if (direct != null) return direct;
  for (const [key, price] of map) {
    if (normalizeMaterialKey(requestedName).includes(key) || key.includes(normalizeMaterialKey(requestedName))) {
      return price;
    }
  }
  return null;
}
