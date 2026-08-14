import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildMaterialSearchQuery, embedText } from "@/lib/ai/embeddings";
import { laborMinutesFromItems, matchServiceIdsByTitles } from "@/lib/ai/match-services";
import { mistralChatParse } from "@/lib/ai/mistral";
import {
  QUOTE_EXTRACTION_JSON_SCHEMA,
  QuoteExtractionSchema,
  type GenerateQuoteFromChatResponse,
  type MatchedSupplierMaterial,
} from "@/lib/ai/quote-from-chat-schema";

type SupplierMatchRow = {
  id: string;
  title: string;
  price: number | string;
  url: string;
  sku: string;
  similarity: number;
};

type ServiceRow = { id: string; title: string; duration: number; price: number | null };

/**
 * Extrait un brouillon de devis depuis une instruction libre (dictée / chat assistant).
 * Ne crée jamais de devis en base — validation humaine ensuite.
 */
export async function buildQuoteFromText(params: {
  supabase: SupabaseClient;
  instruction: string;
  profile: {
    business_name: string | null;
    description: string | null;
    labor_rate_per_hour: number | null;
  };
  services: ServiceRow[];
  customerLabel?: string | null;
}): Promise<GenerateQuoteFromChatResponse> {
  const { supabase, instruction, profile, services, customerLabel } = params;

  const catalogList =
    services.length > 0
      ? services.map((s) => `- ${s.title} (${s.duration} min)`).join("\n")
      : "(aucune prestation configurée)";

  const laborRateEur =
    profile.labor_rate_per_hour != null
      ? (profile.labor_rate_per_hour / 100).toFixed(2)
      : "non renseigné";

  const systemPrompt = `Tu es un expert en chiffrage pour artisans du bâtiment en France.
L'artisan dicte ou écrit une instruction pour préparer un devis.
Extrais un brouillon structuré. N'invente pas de matériaux absents de l'instruction.
Si un matériau est mentionné sans prix, mets-le quand même dans needed_materials.
Pour catalog_service_titles, choisis uniquement parmi les titres du catalogue (orthographe proche OK).
Si aucune prestation catalogue ne correspond, laisse catalog_service_titles vide et décris le travail dans labor_items + notes.
Pour labor_items, quantity = heures estimées, unit_price = taux horaire en euros (utilise ${laborRateEur} €/h si cohérent).
notes : synthèse courte pour le devis (max 500 caractères), en français.`;

  const userPrompt = `Artisan: ${profile.business_name ?? "Artisan"}
${profile.description ? `Description: ${profile.description}` : ""}
${customerLabel ? `Client mentionné: ${customerLabel}` : ""}
Taux horaire artisan: ${laborRateEur} €/h

Catalogue prestations disponibles:
${catalogList}

Instruction de l'artisan:
${instruction}`;

  const extraction = await mistralChatParse(
    QuoteExtractionSchema,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    "quote_extraction",
    {
      temperature: 0.2,
      jsonSchema: QUOTE_EXTRACTION_JSON_SCHEMA,
      jsonExample: `{
  "labor_items": [{ "description": "Construction mur", "quantity": 8, "unit_price": 45 }],
  "catalog_service_titles": ["Maçonnerie"],
  "needed_materials": [
    { "name_generic": "Parpaing", "quantity": 1000, "specifications": null },
    { "name_generic": "Ciment", "quantity": 5, "specifications": "sacs" }
  ],
  "notes": "Mur 50 m — vérifier métrés et accès chantier."
}`,
    },
  );

  if (!extraction) {
    throw new Error("empty_ai_response");
  }

  const warnings: string[] = [];
  const laborDurationMinutes = laborMinutesFromItems(extraction.labor_items);

  const matchedServiceIds = matchServiceIdsByTitles(
    services,
    extraction.catalog_service_titles,
    extraction.labor_items.map((l) => l.description),
  );

  if (!matchedServiceIds.length && services.length > 0) {
    warnings.push(
      "Aucune prestation du catalogue n'a pu être associée automatiquement — sélectionne-les manuellement.",
    );
  }

  if (laborDurationMinutes <= 0 && extraction.labor_items.length > 0) {
    warnings.push("Durée de main d'œuvre non calculée — vérifie les heures dans le formulaire.");
  }

  const supplierMaterials: MatchedSupplierMaterial[] = [];

  for (const material of extraction.needed_materials) {
    const query = buildMaterialSearchQuery(material.name_generic, material.specifications);
    let match: MatchedSupplierMaterial["match"] = null;

    try {
      const embedding = await embedText(query);
      if (embedding.length) {
        const { data: matches, error: rpcErr } = await supabase.rpc("match_supplier_products", {
          query_embedding: embedding,
          match_count: 1,
          match_threshold: 0.35,
        });

        if (rpcErr) {
          console.error("[build-quote-from-text] rpc error", rpcErr);
          warnings.push(`Recherche fournisseur indisponible pour « ${material.name_generic} ».`);
        } else {
          const best = (matches as SupplierMatchRow[] | null)?.[0];
          if (best) {
            const priceNum = typeof best.price === "string" ? Number(best.price) : best.price;
            match = {
              id: best.id,
              title: best.title,
              price_eur: Number.isFinite(priceNum) ? priceNum : 0,
              url: best.url,
              sku: best.sku,
              similarity: best.similarity,
            };
          } else {
            warnings.push(`Aucun produit fournisseur trouvé pour « ${material.name_generic} ».`);
          }
        }
      }
    } catch (err) {
      console.error("[build-quote-from-text] embedding error", err);
      warnings.push(`Erreur d'indexation pour « ${material.name_generic} ».`);
    }

    supplierMaterials.push({
      requested_name: material.name_generic,
      quantity: material.quantity,
      specifications: material.specifications,
      match,
    });
  }

  if (!extraction.needed_materials.length) {
    warnings.push("Aucun matériau détecté dans l'instruction.");
  }

  return {
    labor_items: extraction.labor_items,
    catalog_service_titles: extraction.catalog_service_titles,
    matched_service_ids: matchedServiceIds,
    labor_duration_minutes: laborDurationMinutes,
    notes: extraction.notes,
    supplier_materials: supplierMaterials,
    warnings,
  };
}
