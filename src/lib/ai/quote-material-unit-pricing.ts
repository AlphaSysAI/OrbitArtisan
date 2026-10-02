import "server-only";

import { z } from "zod";

import { mistralChatParse } from "@/lib/ai/mistral";
import { FR_BUILDING_PRICE_DOMAINS, formatWebSearchForPrompt, searchWebForQuoteContext } from "@/lib/ai/web-search";

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

export type MaterialPriceEstimate = {
  prices: Map<string, number>;
  /** Au moins une recherche Tavily a renvoyé des résultats exploitables. */
  webUsed: boolean;
  /** Domaines consultés (traçabilité, affichés à l'artisan). */
  sources: string[];
};

const MAX_WEB_LOOKUPS = 6;

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Prix unitaire HT (€) des matériaux sans correspondance catalogue.
 * Une recherche Tavily PAR matériau, limitée aux négoces / enseignes FR à prix publics
 * (6 max, en parallèle), puis Mistral extrait un prix médian. Sans Tavily : prix marché du LLM.
 */
export async function estimateMaterialUnitPricesEur(
  materials: MaterialToPrice[],
  instructionContext: string,
): Promise<MaterialPriceEstimate> {
  const unique = materials.filter((m) => m.name.trim());
  if (!unique.length) return { prices: new Map(), webUsed: false, sources: [] };

  const searched = await Promise.all(
    unique.slice(0, MAX_WEB_LOOKUPS).map(async (m) => ({
      material: m,
      web: await searchWebForQuoteContext(`prix ${m.name}${m.specifications ? ` ${m.specifications}` : ""}`, {
        includeDomains: FR_BUILDING_PRICE_DOMAINS,
        maxResults: 3,
      }),
    })),
  );
  const webUsed = searched.some((r) => r.web !== null);
  const sources = [
    ...new Set(searched.flatMap((r) => (r.web?.hits ?? []).map((h) => domainOf(h.url)).filter((d): d is string => !!d))),
  ];

  const lines = unique
    .map((m) => {
      const web = searched.find((r) => r.material === m)?.web;
      return [
        `- ${m.name} (qté ${m.quantity}${m.specifications ? `, ${m.specifications}` : ""})`,
        web ? `  Références web :\n${formatWebSearchForPrompt(web).replace(/^/gm, "    ")}` : "  (pas de référence web)",
      ].join("\n");
    })
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
- Si des références web sont fournies pour une ligne, pars des prix QUI Y FIGURENT (convertis TTC → HT en divisant par 1,2 si le prix est TTC) et prends la valeur médiane des produits comparables.
- Attention à l'unité : prix au sac, au m², à la pièce… cohérent avec la quantité demandée.
- Reprends exactement le même "name" que dans la liste utilisateur.
- Sans référence, propose un prix médian marché réaliste (jamais 0).`,
        },
        {
          role: "user",
          content: [
            instructionContext.trim() ? `Contexte chantier :\n${instructionContext.trim().slice(0, 600)}` : "",
            `Matériaux à chiffrer (prix unitaire HT, pas le total) :\n${lines}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      "quote_material_unit_pricing",
      {
        temperature: 0.1,
        jsonSchema: JSON_SCHEMA,
        jsonExample: `{"items":[{"name":"Mortier ciment","unit_price_ht_eur":8.5}]}`,
      },
    );

    const out = new Map<string, number>();
    for (const item of priced.items) {
      if (!item.name.trim() || item.unit_price_ht_eur <= 0) continue;
      out.set(normalizeMaterialKey(item.name), Math.round(item.unit_price_ht_eur * 100) / 100);
    }
    return { prices: out, webUsed, sources };
  } catch (err) {
    console.error("[quote-material-unit-pricing]", err instanceof Error ? err.message : err);
    return { prices: new Map(), webUsed, sources };
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
