import "server-only";

import { z } from "zod";

import { mistralChatParse } from "@/lib/ai/mistral";
import { sanitizeMaterialQuantity } from "@/lib/ai/quote-material-sanity";
import { runMaterialTakeoff } from "@/lib/ai/quote-material-takeoff";
import { formatWebSearchForPrompt, searchWebForQuoteContext } from "@/lib/ai/web-search";

export type LeadMaterialCostEstimate = {
  min: number;
  max: number;
  /** Phrase courte pour la base de l'estimation affichée au client. */
  summary: string;
  webUsed: boolean;
};

function coerceString(v: unknown): string {
  return String(v ?? "").trim();
}

function coercePositiveNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const LeadMaterialPricingSchema = z.object({
  items: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(
      z.object({
        name: z.preprocess(coerceString, z.string()),
        quantity: z.preprocess(coercePositiveNumber, z.number()),
        unit_price_min_eur: z.preprocess(coercePositiveNumber, z.number()),
        unit_price_max_eur: z.preprocess(coercePositiveNumber, z.number()),
      }),
    ),
  ),
  pricing_notes: z.preprocess(coerceString, z.string()),
});

const LEAD_MATERIAL_PRICING_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: "number" },
          unit_price_min_eur: { type: "number", description: "Prix unitaire HT bas, en euros" },
          unit_price_max_eur: { type: "number", description: "Prix unitaire HT haut, en euros" },
        },
        required: ["name", "quantity", "unit_price_min_eur", "unit_price_max_eur"],
      },
    },
    pricing_notes: { type: "string" },
  },
  required: ["items", "pricing_notes"],
};

function buildMaterialSearchQuery(description: string, tradeLabel: string | null): string {
  const compact = description.replace(/\s+/g, " ").trim().slice(0, 180);
  const trade = tradeLabel ? `${tradeLabel} ` : "";
  return `prix fournitures matériaux BTP France ${trade}${compact} euro`;
}

function formatTakeoffLines(
  takeoff: Awaited<ReturnType<typeof runMaterialTakeoff>>,
): string | null {
  if (!takeoff?.materials.length) return null;
  return takeoff.materials
    .map(
      (m) =>
        `- ${m.name_generic} : ${m.quantity} ${m.unit}${m.specifications ? ` (${m.specifications})` : ""}`,
    )
    .join("\n");
}

/**
 * Estime le coût matériaux d'un lead : métré si possible, puis recherche web
 * (Tavily) + Mistral pour chiffrer chaque poste en euros.
 */
export async function estimateLeadMaterialCosts(input: {
  description: string;
  tradeLabel: string | null;
}): Promise<LeadMaterialCostEstimate | null> {
  const description = input.description.trim();
  if (description.length < 12) return null;

  const takeoff = await runMaterialTakeoff(description);
  const takeoffLines = formatTakeoffLines(takeoff);

  const web = await searchWebForQuoteContext(buildMaterialSearchQuery(description, input.tradeLabel));
  const webBlock = web ? formatWebSearchForPrompt(web) : null;

  try {
    const priced = await mistralChatParse(
      LeadMaterialPricingSchema,
      [
        {
          role: "system",
          content: `Tu es un acheteur BTP en France. Tu estimes le coût des fournitures pour une demande de particulier.
Règles :
1. Liste uniquement les matériaux/fournitures plausibles pour le lot décrit (pas d'outillage jetable mineur).
2. Quantités réalistes d'après la description ; si un métré est fourni, reprends ses quantités.
3. unit_price_min_eur / unit_price_max_eur = prix unitaire HT en euros (fourchette marché particulier/pro).
4. Croise les références web si présentes ; sinon utilise des prix moyens constatés en grande surface pro / négoce BTP France.
5. Si le lot est quasi 100 % main-d'œuvre (dépannage simple sans fourniture notable), renvoie items=[] et explique dans pricing_notes.
6. Ne gonfle pas les quantités (ex. parpaings : proportions mur, pas surface au sol × 10).`,
        },
        {
          role: "user",
          content: [
            input.tradeLabel ? `Métier : ${input.tradeLabel}` : "",
            `Description :\n${description}`,
            takeoffLines ? `Métré automatique (quantités à reprendre) :\n${takeoffLines}` : "",
            webBlock ? `Références prix web (indicatives) :\n${webBlock}` : "Pas de recherche web — prix de référence marché.",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      "lead_material_pricing",
      {
        temperature: 0.2,
        jsonSchema: LEAD_MATERIAL_PRICING_JSON_SCHEMA,
        jsonExample: `{
  "items": [
    { "name": "Siphon évier chromé", "quantity": 1, "unit_price_min_eur": 12, "unit_price_max_eur": 28 },
    { "name": "Joint fibre + paste", "quantity": 1, "unit_price_min_eur": 4, "unit_price_max_eur": 9 }
  ],
  "pricing_notes": "Petites fournitures plomberie — robinetterie non remplacée."
}`,
      },
    );

    const items = priced.items
      .map((item) => {
        const { quantity } = sanitizeMaterialQuantity(item.name, item.quantity);
        const qty = quantity > 0 ? quantity : item.quantity;
        const minUnit = Math.min(item.unit_price_min_eur, item.unit_price_max_eur);
        const maxUnit = Math.max(item.unit_price_min_eur, item.unit_price_max_eur);
        return { ...item, quantity: qty, minUnit, maxUnit };
      })
      .filter((item) => item.name && item.quantity > 0 && item.minUnit > 0);

    if (!items.length) return null;

    const min = Math.round(items.reduce((sum, i) => sum + i.quantity * i.minUnit, 0));
    const max = Math.round(items.reduce((sum, i) => sum + i.quantity * i.maxUnit, 0));
    if (max <= 0) return null;

    const labels = items
      .slice(0, 4)
      .map((i) => i.name)
      .join(", ");
    const summary =
      priced.pricing_notes.trim() ||
      `Fournitures estimées (${labels}${items.length > 4 ? "…" : ""})`;

    return {
      min: Math.max(min, 0),
      max: Math.max(max, min),
      summary,
      webUsed: web != null,
    };
  } catch (err) {
    console.error("[lead-material-estimate]", err instanceof Error ? err.message : err);
    return null;
  }
}
