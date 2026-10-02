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

type MaterialToPrice = {
  name: string;
  quantity: number;
  specifications: string | null;
};

type MaterialPriceEstimate = {
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
          content: `Tu estimes des prix unitaires HT en euros pour des fournitures BTP en France (négoce pro / GSB).
Règles :
- Un prix par ligne, fourniture seule (jamais de main-d'œuvre ni de pose), STRICTEMENT HORS TAXES.
- Références web : pars des prix QUI Y FIGURENT et prends la médiane des produits comparables. Les enseignes grand
  public (Leroy Merlin, Castorama, Brico Dépôt, Bricoman, ManoMano…) affichent du TTC : divise par 1,20. En cas de doute
  sur HT/TTC, considère TTC et divise par 1,20.
- Unité : le prix correspond à l'unité indiquée en tête des précisions (u, m², ml, sacs, rouleaux…). Si c'est un
  conditionnement (sac de 25 kg, rouleau de 75 m², boîte de 1000), c'est le prix du conditionnement entier ; sinon
  ramène le prix web à l'unité (prix d'un rouleau ÷ m² du rouleau pour une ligne en m², etc.).
- Ouvrages préfabriqués ou sans prix de détail (charpente fermette, escalier sur mesure, menuiserie sur mesure…) :
  applique un ratio professionnel du marché français dans l'unité demandée (ex. fourniture de fermettes au m² de
  toiture) — jamais le prix d'un kit, d'un abri de jardin ou d'un produit hors sujet trouvé en ligne.
- Écarte les résultats aberrants (lot, palette, produit d'une autre catégorie) plutôt que de les moyenner.
- Reprends exactement le même "name" que dans la liste utilisateur.
- 0 € est INTERDIT : sans référence exploitable, donne une estimation basse réaliste issue des prix moyens du
  bâtiment en France.`,
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
