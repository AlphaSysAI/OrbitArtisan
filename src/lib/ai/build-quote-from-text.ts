import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildMaterialSearchQuery, embedText } from "@/lib/ai/embeddings";
import { laborMinutesFromItems, matchServiceIdsByTitles } from "@/lib/ai/match-services";
import { mistralChatParse } from "@/lib/ai/mistral";
import { sanitizeMaterialQuantity } from "@/lib/ai/quote-material-sanity";
import {
  formatTakeoffForQuotePrompt,
  runMaterialTakeoff,
  takeoffWarnings,
  type MaterialTakeoff,
} from "@/lib/ai/quote-material-takeoff";
import {
  estimateMaterialUnitPricesEur,
  lookupEstimatedUnitPrice,
} from "@/lib/ai/quote-material-unit-pricing";
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

type NeededMaterial = {
  name_generic: string;
  quantity: number;
  specifications: string | null;
};

function materialsFromTakeoff(takeoff: MaterialTakeoff): NeededMaterial[] {
  return takeoff.materials.map((m) => ({
    name_generic: m.name_generic,
    quantity: Math.ceil(m.quantity),
    specifications: m.specifications ?? m.unit,
  }));
}

function applyMaterialSanity(materials: NeededMaterial[], warnings: string[]): NeededMaterial[] {
  return materials.map((m) => {
    const { quantity, warnings: w } = sanitizeMaterialQuantity(m.name_generic, m.quantity);
    warnings.push(...w);
    return { ...m, quantity };
  });
}

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

  const warnings: string[] = [];
  let takeoffBlock = "";
  let takeoff: MaterialTakeoff | null = null;
  const webSearchEnabled = Boolean(process.env.TAVILY_API_KEY?.trim());

  try {
    takeoff = await runMaterialTakeoff(instruction);
    if (takeoff) {
      takeoffBlock = formatTakeoffForQuotePrompt(takeoff, webSearchEnabled);
      warnings.push(...takeoffWarnings(takeoff, webSearchEnabled));
    }
  } catch (err) {
    console.error("[build-quote-from-text] takeoff error", err);
    warnings.push("Le métré automatique n'a pas pu être calculé — complète les matériaux à la main.");
  }

  const systemPrompt = `Tu es un expert en chiffrage pour artisans du bâtiment en France.
L'artisan dicte ou écrit une instruction pour préparer un devis.
Extrais un brouillon structuré.

Matériaux :
- Si un bloc « Métré automatique » est fourni, reprends EXACTEMENT ces matériaux et quantités dans needed_materials.
- Sinon, n'invente pas de matériaux absents de l'instruction.
- Ne multiplie pas les quantités : plancher et toiture ne se chiffrent pas en parpaings.
- Si un matériau est mentionné sans prix, mets-le quand même dans needed_materials (specifications = unité : sacs, m³, U…).

Prestations :
- catalog_service_titles : uniquement parmi le catalogue (orthographe proche OK).
- Si aucune prestation catalogue ne correspond, laisse catalog_service_titles vide et décris le travail dans labor_items + notes.

Main-d'œuvre :
- labor_items : quantity = heures estimées, unit_price = taux horaire en euros (utilise ${laborRateEur} €/h si cohérent).
- Si un métré indique des heures MO, utilise-les comme base.

notes : synthèse courte pour le devis (max 500 caractères), en français. Mentionne que le métré est indicatif si applicable.`;

  const userPrompt = `Artisan: ${profile.business_name ?? "Artisan"}
${profile.description ? `Description: ${profile.description}` : ""}
${customerLabel ? `Client mentionné: ${customerLabel}` : ""}
Taux horaire artisan: ${laborRateEur} €/h

Catalogue prestations disponibles:
${catalogList}

${takeoffBlock ? `${takeoffBlock}\n\n` : ""}Instruction de l'artisan:
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

  let neededMaterials: NeededMaterial[] =
    takeoff?.materials.length ? materialsFromTakeoff(takeoff) : extraction.needed_materials;

  if (takeoff?.materials.length) {
    warnings.push("Quantités matériaux issues du métré automatique — à valider sur chantier.");
  }

  neededMaterials = applyMaterialSanity(neededMaterials, warnings);

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

  // Point 14 audit pré-pilote : matching fournisseur parallélisé (au lieu d'un
  // aller-retour embedding + RPC séquentiel par matériau) pour ne pas cumuler
  // la latence réseau linéairement avec le nombre de matériaux détectés lors
  // d'un appel en direct. Chaque matériau reste indépendant : un échec isolé
  // ne bloque pas les autres, et l'ordre des lignes est préservé (Promise.all).
  async function matchOneMaterial(material: NeededMaterial): Promise<MatchedSupplierMaterial> {
    const query = buildMaterialSearchQuery(material.name_generic, material.specifications);
    let match: MatchedSupplierMaterial["match"] = null;
    const localWarnings: string[] = [];

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
          localWarnings.push(`Recherche fournisseur indisponible pour « ${material.name_generic} ».`);
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
            localWarnings.push(`Aucun produit fournisseur trouvé pour « ${material.name_generic} ».`);
          }
        }
      }
    } catch (err) {
      console.error("[build-quote-from-text] embedding error", err);
      localWarnings.push(`Erreur d'indexation pour « ${material.name_generic} ».`);
    }

    warnings.push(...localWarnings);

    return {
      requested_name: material.name_generic,
      quantity: material.quantity,
      specifications: material.specifications,
      match,
    };
  }

  let supplierMaterials: MatchedSupplierMaterial[] = await Promise.all(
    neededMaterials.map(matchOneMaterial),
  );

  const withoutCatalogPrice = supplierMaterials.filter((row) => !row.match);
  if (withoutCatalogPrice.length) {
    const estimates = await estimateMaterialUnitPricesEur(
      withoutCatalogPrice.map((row) => ({
        name: row.requested_name,
        quantity: row.quantity,
        specifications: row.specifications,
      })),
      instruction,
    );
    if (estimates.size) {
      supplierMaterials = supplierMaterials.map((row) => {
        if (row.match) return row;
        const est = lookupEstimatedUnitPrice(estimates, row.requested_name);
        if (est == null) return row;
        return { ...row, estimated_unit_price_eur: est };
      });
      warnings.push(
        "Prix matériaux estimés (web / marché) pour les lignes sans correspondance catalogue — à valider.",
      );
    } else if (withoutCatalogPrice.length) {
      warnings.push(
        "Certains matériaux n'ont pas de prix catalogue : complète les prix unitaires dans le formulaire.",
      );
    }
  }

  if (!neededMaterials.length) {
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
