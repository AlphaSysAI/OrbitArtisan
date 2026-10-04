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
import { formatTradeLabel } from "@/lib/trades/taxonomy";
import { applyMaterialsMargin } from "@/lib/billing/materials-margin";
import { findReferencePrice } from "@/lib/ai/recipe-reference-prices";
import { roundMaterialQuantity } from "@/lib/quotes/material-quantity";
import {
  formatOuvragesForPrompt,
  resolveOuvrageLines,
  shortlistOuvrages,
  type LibraryWorkItemRow,
  type OuvrageCandidate,
} from "@/lib/ai/ouvrage-candidates";
import { filterPlatformCatalog } from "@/lib/work-library/platform-catalog";

/** Similarité minimale (embeddings mistral-embed) pour proposer un produit catalogue. */
const CATALOG_MIN_SIMILARITY = 0.6;

const STOP_WORDS = new Set(["pour", "avec", "sans", "sous", "type", "standard", "blanc", "noir", "gris", "sac", "sacs", "lot", "kit"]);

function keywords(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w))
    .map((w) => w.replace(/s$/, ""));
}

/** Le produit catalogue partage au moins un mot significatif avec le matériau demandé. */
export function sharesKeyword(requested: string, productTitle: string): boolean {
  const wanted = new Set(keywords(requested));
  return keywords(productTitle).some((w) => wanted.has(w));
}

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
  /** Unité d'achat (métré) : condition pour appliquer un prix de référence de la bibliothèque. */
  unit?: string | null;
};

function materialsFromTakeoff(takeoff: MaterialTakeoff): NeededMaterial[] {
  return takeoff.materials.map((m) => ({
    name_generic: m.name_generic,
    // Entier pour u / sacs / rouleaux…, 2 décimales pour m³, m², ml, kg, t, L.
    quantity: roundMaterialQuantity(m.quantity, m.unit),
    unit: m.unit,
    // L'unité d'achat reste visible même quand un conditionnement est précisé : sans elle,
    // « 2 » + « Rouleau de 75 m² » ou « 1800 » + « Palette de 300 » est ambigu pour le chiffrage.
    specifications: m.specifications ? `${m.unit} · ${m.specifications}` : m.unit,
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
    /** Métier déclaré (nomenclature) : borne le périmètre du devis. */
    trade_category?: string | null;
    trade?: string | null;
    materials_margin_rate?: number | null;
    /** Compte auth de l'artisan : clé de sa bibliothèque d'ouvrages (work_items.user_id). */
    user_id?: string | null;
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

  const tradeLabel = formatTradeLabel(profile.trade_category, profile.trade);
  const marginRate = Number(profile.materials_margin_rate ?? 0) || 0;

  const warnings: string[] = [];
  let takeoffBlock = "";
  let takeoff: (MaterialTakeoff & { laborPhases?: { title: string; hours: number }[] }) | null = null;

  try {
    const result = await runMaterialTakeoff(instruction, { audience: "artisan", tradeLabel });
    takeoff = result;
    if (result) {
      // Mention « sources web » uniquement si Tavily a réellement répondu.
      takeoffBlock = formatTakeoffForQuotePrompt(result, result.webUsed);
      warnings.push(...takeoffWarnings(result, result.webUsed));
    }
  } catch (err) {
    console.error("[build-quote-from-text] takeoff error", err);
    warnings.push("Le métré automatique n'a pas pu être calculé — complète les matériaux à la main.");
  }

  // Ouvrages chiffrés : bibliothèque de l'artisan d'abord, puis catalogue Soline borné à son métier.
  let ouvrageCandidates: OuvrageCandidate[] = [];
  try {
    let library: LibraryWorkItemRow[] = [];
    if (profile.user_id) {
      const { data, error } = await supabase
        .from("work_items")
        .select("reference, title, description, unit, unit_price_ht, default_vat_rate")
        .eq("user_id", profile.user_id)
        .limit(2000);
      if (error) console.error("[build-quote-from-text] bibliothèque", error.message);
      library = (data ?? []) as LibraryWorkItemRow[];
    }
    ouvrageCandidates = shortlistOuvrages(
      instruction,
      library,
      filterPlatformCatalog(profile.trade_category, profile.trade),
    );
  } catch (err) {
    console.error("[build-quote-from-text] ouvrages", err);
  }
  const ouvragesBlock = formatOuvragesForPrompt(ouvrageCandidates);

  const systemPrompt = `Tu es un expert en chiffrage pour artisans du bâtiment en France (TCE).
L'artisan dicte ou écrit une instruction pour préparer un devis.
Extrais un brouillon structuré.

Périmètre — NE JAMAIS EXTRAPOLER :
- Métier de l'artisan : ${tradeLabel ?? "non renseigné"}.
- Ne chiffre que ce qui est explicitement demandé. Pour une demande globale (« maison neuve de 125 m² »,
  « rénovation complète »), uniquement les travaux du métier de l'artisan : aucun lot d'un autre corps d'état
  (charpente, couverture, plomberie, électricité, plâtrerie…) sauf s'il est nommé dans l'instruction.
- Ce périmètre vaut pour needed_materials ET labor_items. Les lots écartés peuvent être cités dans notes
  (« Non compris : … »), jamais chiffrés.

Matériaux :
- Si un bloc « Métré automatique » est fourni, reprends CHAQUE matériau de ce bloc dans needed_materials, un par un,
  avec sa désignation technique exacte, sa quantité et son conditionnement (specifications). INTERDIT : regrouper,
  résumer, renommer ou tronquer des postes (pas de « fournitures toiture », « accessoires divers »).
- Sinon, n'invente pas de matériaux absents de l'instruction ; désignations marchandes standard (comme en négoce).
- Ne multiplie pas les quantités : plancher et toiture ne se chiffrent pas en parpaings.
- Si un matériau est mentionné sans prix, mets-le quand même dans needed_materials (specifications = unité et
  conditionnement : sacs de 25 kg, m², ml, u…).

Ouvrages chiffrés (ouvrage_lines) :
- Si un bloc « Ouvrages chiffrés disponibles » est fourni et qu'un poste demandé correspond EXACTEMENT à l'un
  d'eux (même nature de travail, même matériau), ajoute { key, quantity } dans ouvrage_lines, quantité dans
  l'unité de l'ouvrage (m², ml, U…). Préfère toujours la bibliothèque de l'artisan au catalogue Soline.
- Un poste couvert par un ouvrage est déjà chiffré fourni posé : ne le remets PAS dans labor_items ni dans
  needed_materials (sinon il est compté deux fois).
- Jamais pour un poste déjà présent dans le « Métré automatique ». En cas de doute, n'utilise pas d'ouvrage.
- Sans bloc ou sans correspondance : ouvrage_lines = [].

Prestations :
- catalog_service_titles : uniquement parmi le catalogue (orthographe proche OK).
- Si aucune prestation catalogue ne correspond, laisse catalog_service_titles vide et décris le travail dans labor_items + notes.

Main-d'œuvre :
- labor_items DOIT contenir AU MOINS 2 à 4 lignes, une par sous-tâche distincte, dans l'ordre du chantier, dès que
  l'ouvrage comporte plusieurs étapes — jamais un forfait global (pas « Travaux toiture 200 h » mais
  « Pose charpente fermette », « Pose écran HPV, contre-lattage et litelage », « Pose tuiles, faîtage et rives »).
  Une seule ligne uniquement pour une intervention réellement unitaire.
- description = intitulé de la phase tel qu'il apparaîtra sur le devis (verbe + ouvrage, sans heures ni prix).
- quantity = heures de la phase, unit_price = taux horaire en euros (utilise ${laborRateEur} €/h si cohérent).
- Si le métré indique des heures MO (« Main-d'œuvre estimée »), répartis-les entre les phases au prorata de leur
  poids réel : la somme des quantity DOIT égaler exactement ce total.

notes : réserves techniques en français, 500 caractères maximum : métré indicatif à valider sur place, hypothèses
structurantes (pente, état et planéité des supports, accès chantier, évacuation des gravats) — pas de répétition des lignes.`;

  const userPrompt = `Artisan: ${profile.business_name ?? "Artisan"}
${profile.description ? `Description: ${profile.description}` : ""}
${customerLabel ? `Client mentionné: ${customerLabel}` : ""}
Taux horaire artisan: ${laborRateEur} €/h

Catalogue prestations disponibles:
${catalogList}

${takeoffBlock ? `${takeoffBlock}\n\n` : ""}${ouvragesBlock ? `${ouvragesBlock}\n\n` : ""}Instruction de l'artisan:
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
  "labor_items": [
    { "description": "Implantation et montage des murs en parpaings", "quantity": 12, "unit_price": 45 },
    { "description": "Réalisation des chaînages et linteaux", "quantity": 4, "unit_price": 45 }
  ],
  "catalog_service_titles": ["Maçonnerie"],
  "needed_materials": [
    { "name_generic": "Parpaing creux 20×20×50", "quantity": 1000, "specifications": "u" },
    { "name_generic": "Mortier bâtard prêt à l'emploi", "quantity": 5, "specifications": "sacs · Sac de 35 kg" }
  ],
  "notes": "Mur 50 m — vérifier métrés et accès chantier.",
  "ouvrage_lines": []
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

  // Recette de la matrice : phases et heures déterministes, prioritaires sur la ventilation du modèle.
  const laborItems = takeoff?.laborPhases?.length
    ? takeoff.laborPhases.map((p) => ({
        description: p.title,
        quantity: p.hours,
        unit_price:
          profile.labor_rate_per_hour != null
            ? profile.labor_rate_per_hour / 100
            : (extraction.labor_items[0]?.unit_price ?? 0),
      }))
    : extraction.labor_items;

  const laborDurationMinutes = laborMinutesFromItems(laborItems);

  // Ouvrages choisis par le modèle : prix, unité et TVA repris de la source, jamais du modèle.
  // Les postes du métré déterministe restent prioritaires (pas de double comptage).
  const blockedTitles = takeoff?.materials.length
    ? [...takeoff.materials.map((m) => m.name_generic), ...(takeoff.laborPhases ?? []).map((p) => p.title)]
    : [];
  const resolvedOuvrages = resolveOuvrageLines(extraction.ouvrage_lines, ouvrageCandidates, blockedTitles);
  const ouvrageLines = resolvedOuvrages.map((o) => ({
    source: o.source,
    reference: o.reference,
    title: o.title,
    description: o.description,
    unit: o.unit,
    quantity: o.quantity,
    unit_price_eur: o.unitPriceEur,
    vat_rate: o.vatRate,
  }));
  const fromLibrary = resolvedOuvrages.filter((o) => o.source === "library").length;
  const fromSoline = resolvedOuvrages.length - fromLibrary;
  if (fromLibrary) {
    warnings.push(`${fromLibrary} ouvrage${fromLibrary > 1 ? "s" : ""} au prix de ta bibliothèque.`);
  }
  if (fromSoline) {
    warnings.push(
      `${fromSoline} ouvrage${fromSoline > 1 ? "s" : ""} au prix indicatif du catalogue Soline (fourni posé, marge incluse) — à valider.`,
    );
  }
  for (const o of resolvedOuvrages) {
    if (o.vatRate === 5.5) {
      warnings.push(
        `« ${o.title} » à TVA 5,5 % : rénovation énergétique d'un logement de plus de 2 ans uniquement (performances et attestation à vérifier).`,
      );
    }
    if (o.quantity !== o.requestedQuantity) {
      warnings.push(
        `« ${o.title} » : ${String(o.requestedQuantity).replace(".", ",")} ${o.unit} arrondi à ${String(o.quantity).replace(".", ",")}.`,
      );
    }
  }

  const matchedServiceIds = matchServiceIdsByTitles(
    services,
    extraction.catalog_service_titles,
    laborItems.map((l) => l.description),
  );

  if (!matchedServiceIds.length && services.length > 0) {
    warnings.push(
      "Aucune prestation du catalogue n'a pu être associée automatiquement — sélectionne-les manuellement.",
    );
  }

  if (laborDurationMinutes <= 0 && laborItems.length > 0) {
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
          match_count: 3,
          match_threshold: CATALOG_MIN_SIMILARITY,
        });

        if (rpcErr) {
          console.error("[build-quote-from-text] rpc error", rpcErr);
          localWarnings.push(`Recherche fournisseur indisponible pour « ${material.name_generic} ».`);
        } else {
          // Un produit catalogue n'est retenu que s'il partage un mot significatif avec le
          // matériau demandé : la seule proximité d'embedding associait n'importe quoi
          // (seuil 0,35) et empêchait toute estimation de prix web.
          const best = ((matches as SupplierMatchRow[] | null) ?? []).find((m) =>
            sharesKeyword(material.name_generic, m.title),
          );
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
      unit: material.unit ?? null,
      match,
    };
  }

  // 1. Barème de la bibliothèque d'ouvrages (prix moyens HT d'achat) : prioritaire.
  //    Ligne facturée par l'artisan, marge des réglages appliquée ; ni catalogue ni web.
  // 2. Sinon catalogue fournisseur, puis recherche web pour ce qui reste sans prix.
  let referencePriced = 0;
  let supplierMaterials: MatchedSupplierMaterial[] = await Promise.all(
    neededMaterials.map((material) => {
      const reference = findReferencePrice(material.name_generic, material.unit);
      if (!reference) return matchOneMaterial(material);
      referencePriced += 1;
      return Promise.resolve<MatchedSupplierMaterial>({
        requested_name: material.name_generic,
        quantity: material.quantity,
        specifications: material.specifications,
        unit: material.unit ?? null,
        match: null,
        estimated_unit_price_eur: applyMaterialsMargin(reference.priceHtEur, marginRate),
      });
    }),
  );
  if (referencePriced) {
    warnings.push(
      `${referencePriced} fourniture${referencePriced > 1 ? "s" : ""} chiffrée${referencePriced > 1 ? "s" : ""} au barème Soline (prix moyens HT)${marginRate > 0 ? `, ta marge de ${String(marginRate).replace(".", ",")} % incluse` : ""} — à valider.`,
    );
  }

  const withoutCatalogPrice = supplierMaterials.filter((row) => !row.match && row.estimated_unit_price_eur == null);
  if (withoutCatalogPrice.length) {
    const estimates = await estimateMaterialUnitPricesEur(
      withoutCatalogPrice.map((row) => ({
        name: row.requested_name,
        quantity: row.quantity,
        specifications: row.specifications,
      })),
      instruction,
    );
    if (estimates.prices.size) {
      supplierMaterials = supplierMaterials.map((row) => {
        if (row.match || row.estimated_unit_price_eur != null) return row;
        const est = lookupEstimatedUnitPrice(estimates.prices, row.requested_name);
        if (est == null) return row;
        // Prix d'achat estimé → prix de vente : marge de l'artisan (réglages), jamais affichée au client.
        return { ...row, estimated_unit_price_eur: applyMaterialsMargin(est, marginRate) };
      });
      const marginNote = marginRate > 0 ? ` Ta marge de ${String(marginRate).replace(".", ",")} % est incluse.` : "";
      warnings.push(
        (estimates.webUsed
          ? `Prix matériaux estimés d'après les prix publics (${estimates.sources.slice(0, 4).join(", ")}) — à valider.`
          : "Prix matériaux estimés (marché, sans recherche web) — à valider.") + marginNote,
      );
    } else if (withoutCatalogPrice.length) {
      warnings.push(
        "Certains matériaux n'ont pas de prix catalogue : complète les prix unitaires dans le formulaire.",
      );
    }
  }

  if (!neededMaterials.length && !ouvrageLines.length) {
    warnings.push("Aucun matériau détecté dans l'instruction.");
  }

  return {
    labor_items: laborItems,
    catalog_service_titles: extraction.catalog_service_titles,
    matched_service_ids: matchedServiceIds,
    labor_duration_minutes: laborDurationMinutes,
    notes: extraction.notes,
    supplier_materials: supplierMaterials,
    ouvrage_lines: ouvrageLines,
    warnings,
  };
}
