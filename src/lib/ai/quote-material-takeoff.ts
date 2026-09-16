import "server-only";

import { z } from "zod";

import { mistralChatParse } from "@/lib/ai/mistral";
import { isMasonryUnitMaterial } from "@/lib/ai/quote-material-sanity";
import { formatWebSearchForPrompt, searchWebForQuoteContext } from "@/lib/ai/web-search";

function coerceString(v: unknown): string {
  return String(v ?? "").trim();
}

function coerceNullableString(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v).trim() || null;
}

function coerceNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v ?? "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function coercePositiveNumber(v: unknown): number {
  return Math.max(0.01, coerceNumber(v));
}

export const MaterialTakeoffSchema = z.object({
  work_summary: z.preprocess(coerceString, z.string()),
  assumptions: z.preprocess(
    (v) => (Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : []),
    z.array(z.string()),
  ),
  materials: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(
      z.object({
        name_generic: z.preprocess(coerceString, z.string()),
        quantity: z.preprocess(coercePositiveNumber, z.number().positive()),
        unit: z.preprocess(coerceString, z.string()),
        specifications: z.preprocess(coerceNullableString, z.string().nullable()),
      }),
    ),
  ),
  /**
   * Surface totale de murs porteurs à monter en parpaings/agglos (m²), quand le
   * chantier en nécessite. Le LLM ne doit PAS calculer lui-même le nombre de blocs
   * (chaîne de calcul — surface × ratio — qu'il rate régulièrement d'un facteur 10,
   * cf. quote-material-sanity.ts) : il estime uniquement cette surface, ratio
   * appliqué en code dans computeMasonryBlockCount().
   */
  masonry_wall_area_m2: z.preprocess(
    (v) => {
      if (v == null || v === "") return null;
      const n = coerceNumber(v);
      return n > 0 ? n : null;
    },
    z.number().positive().nullable(),
  ),
  labor_hours_estimate: z.preprocess(
    (v) => {
      if (v == null || v === "") return null;
      const n = coerceNumber(v);
      return n > 0 ? n : null;
    },
    z.number().positive().nullable(),
  ),
  calculation_notes: z.preprocess(coerceString, z.string()),
});

export type MaterialTakeoff = z.infer<typeof MaterialTakeoffSchema>;

export const MATERIAL_TAKEOFF_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    work_summary: { type: "string" },
    assumptions: { type: "array", items: { type: "string" } },
    materials: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name_generic: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string", description: "U, sacs, m³, L, kg…" },
          specifications: { type: "string" },
        },
        required: ["name_generic", "quantity", "unit"],
      },
    },
    masonry_wall_area_m2: {
      type: ["number", "null"],
      description:
        "Surface totale des murs porteurs à monter en parpaings/agglos (m²), si le chantier en nécessite. " +
        "Null sinon. Ne calcule PAS toi-même le nombre de blocs à partir de cette surface : ne liste " +
        "AUCUN parpaing/agglo dans materials, indique juste la surface ici, le nombre de blocs est calculé " +
        "automatiquement à partir de ce champ.",
    },
    labor_hours_estimate: { type: "number", description: "Heures MO estimées" },
    calculation_notes: { type: "string" },
  },
  required: ["work_summary", "assumptions", "materials", "calculation_notes"],
};

/**
 * Ratio standard BTP France pour un parpaing/agglo 20×20×50 cm : 2 blocs/m de large
 * × 5 blocs/m de haut = 10 blocs/m² de mur (source : pratique courante du métier).
 * Marge de chute : 5 %, cohérent avec le reste du métré (arrondi supérieur).
 * Constantes volontairement isolées et documentées : à ajuster si l'artisan utilise
 * un autre format de bloc.
 */
export const MASONRY_BLOCKS_PER_M2 = 10;
export const MASONRY_WASTE_MARGIN = 0.05;

/** Calcule un nombre de parpaings/agglos de façon déterministe — jamais via le LLM. */
export function computeMasonryBlockCount(wallAreaM2: number): number {
  return Math.ceil(wallAreaM2 * MASONRY_BLOCKS_PER_M2 * (1 + MASONRY_WASTE_MARGIN));
}

const WORK_KEYWORDS =
  /mur|parpaing|agglo|brique|bloc|dalle|chape|toiture|carrelage|enduit|cloison|fondation|terrasse|maçonnerie|maconnerie|beton|béton|linteau|poteau|hourdis|planelle|plancher/i;

/** Chantier global sans métré explicite (maison neuve, gros œuvre…). */
export function isWholeHouseMasonryProject(instruction: string): boolean {
  return /maison\s+neuve|construction\s+(d[''])?une\s+maison|maison\s+individuelle|gros\s+[œoe]uvre|murs?\s+porteurs?|charpente\s+traditionnelle/i.test(
    instruction,
  );
}

/** Détecte une description de chantier où un métré automatique est utile. */
export function needsMaterialTakeoff(instruction: string): boolean {
  const text = instruction.trim();
  if (text.length < 12) return false;

  const hasWork = WORK_KEYWORDS.test(text);
  if (!hasWork) return false;

  const hasDimension =
    /\d+[,.]?\d*\s*(m(?:l|²|³|ètre|eter|ètres|eters)?|cm|mm)\b/i.test(text) ||
    /\d+\s*[x×]\s*\d+/i.test(text) ||
    /\d+[,.]?\d*\s*m\s*lin/i.test(text);

  if (hasDimension) return true;

  return isWholeHouseMasonryProject(text);
}

export function takeoffAssumptionHint(instruction: string): string | null {
  if (!isWholeHouseMasonryProject(instruction)) return null;
  if (/\d+[,.]?\d*\s*m(?:²|2)\b/i.test(instruction)) return null;

  return (
    "Surface du projet non précisée dans la description : formule des hypothèses dimensionnelles " +
    "dans assumptions avant de chiffrer, et indique qu'elles sont à valider sur chantier."
  );
}

function buildWebSearchQuery(instruction: string): string {
  const compact = instruction.replace(/\s+/g, " ").trim().slice(0, 220);
  return `quantité matériaux chantier BTP France ${compact} métré parpaing ciment sable`;
}

/**
 * Estime matériaux + MO à partir d'une description dimensionnée.
 * Enrichi par Tavily si `TAVILY_API_KEY` est configurée.
 */
export async function runMaterialTakeoff(instruction: string): Promise<MaterialTakeoff | null> {
  if (!needsMaterialTakeoff(instruction)) return null;

  const web = await searchWebForQuoteContext(buildWebSearchQuery(instruction));
  const webBlock = web ? formatWebSearchForPrompt(web) : null;

  const systemPrompt = `Tu es un métreur / économiste de la construction en France (BTP).
À partir de la description de travaux, estime les matériaux nécessaires et les quantités réalistes.

Règles :
- Applique les ratios métiers standards du BTP en France ; documente chaque hypothèse dimensionnelle dans "assumptions".
- Les parpaings / agglos concernent les murs porteurs — pas le plancher, la dalle ni la toiture (hourdis, béton, charpente, couverture).
- IMPORTANT — parpaings/agglos : ne les liste JAMAIS dans "materials" et ne calcule JAMAIS toi-même leur
  quantité. Indique uniquement la surface totale de murs porteurs à monter dans "masonry_wall_area_m2"
  (m², déductions des ouvertures si pertinent) — le nombre de blocs est calculé automatiquement à partir
  de cette surface avec un ratio fixe. Si aucun mur porteur en parpaings n'est nécessaire, laisse ce champ null.
- Ne cumule pas plusieurs lots en multipliant plusieurs fois la même surface au sol.
- Prévois une marge de chute réaliste pour les AUTRES matériaux (ciment, sable…) et indique-la dans "assumptions".
- Détaille les hypothèses dans "assumptions" (dimensions bloc, épaisseur joint, ouvertures non déduites si absentes, etc.).
- "materials" : noms génériques en français, quantités arrondies à l'entier supérieur pour les U/sacs — hors parpaings/agglos (cf. règle ci-dessus).
- "unit" : U, sacs, m³, kg, L, ml, m²…
- "labor_hours_estimate" : heures MO réalistes pour l'ouvrage décrit.
- "calculation_notes" : rappel court que le métré est indicatif et doit être validé sur site.
- Si des références web sont fournies, croise-les avec ton expertise ; ne copie pas aveuglément.
- Ne liste pas d'outillage consommable mineur (seaux, truelles) sauf si quantités significatives.`;

  const assumptionHint = takeoffAssumptionHint(instruction);

  const userParts = [`Description des travaux :\n${instruction}`];
  if (assumptionHint) {
    userParts.push(assumptionHint);
  }
  if (webBlock) {
    userParts.push(`Références web (indicatives, à recouper) :\n${webBlock}`);
  } else {
    userParts.push(
      "Aucune recherche web disponible — base-toi sur les pratiques courantes du BTP en France.",
    );
  }

  const takeoff = await mistralChatParse(
    MaterialTakeoffSchema,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userParts.join("\n\n") },
    ],
    "material_takeoff",
    {
      temperature: 0.15,
      jsonSchema: MATERIAL_TAKEOFF_JSON_SCHEMA,
      jsonExample: `{
  "work_summary": "Mur en parpaings 10 ml × 2 m",
  "assumptions": ["Parpaing 20×20×50 cm", "Pas d'ouverture déduite"],
  "materials": [
    { "name_generic": "Mortier ciment", "quantity": 12, "unit": "sacs", "specifications": "35 kg" },
    { "name_generic": "Sable", "quantity": 1.2, "unit": "m³", "specifications": null }
  ],
  "masonry_wall_area_m2": 20,
  "labor_hours_estimate": 16,
  "calculation_notes": "Métré indicatif — confirmer métrés et accès sur chantier."
}`,
    },
  );

  if (!takeoff) return null;

  // Calcul déterministe des parpaings/agglos à partir de la surface estimée par le
  // LLM (jamais l'inverse) — voir computeMasonryBlockCount(). Défensif : si le modèle
  // a quand même listé un parpaing/agglo dans "materials" malgré la consigne, on le
  // retire pour éviter un doublon avec la ligne calculée.
  let materials = takeoff.materials;
  const assumptions = [...takeoff.assumptions];

  if (takeoff.masonry_wall_area_m2) {
    const ignoredByLlm = materials.filter((m) => isMasonryUnitMaterial(m.name_generic));
    if (ignoredByLlm.length) {
      materials = materials.filter((m) => !isMasonryUnitMaterial(m.name_generic));
    }

    const blockCount = computeMasonryBlockCount(takeoff.masonry_wall_area_m2);
    materials = [
      ...materials,
      {
        name_generic: "Parpaing creux 20×20×50",
        quantity: blockCount,
        unit: "U",
        specifications: `Calculé : ${takeoff.masonry_wall_area_m2} m² × ${MASONRY_BLOCKS_PER_M2}/m² + ${Math.round(MASONRY_WASTE_MARGIN * 100)} % chute`,
      },
    ];
    assumptions.push(
      `Parpaings calculés automatiquement à partir de la surface de mur estimée (${takeoff.masonry_wall_area_m2} m²) — ratio ${MASONRY_BLOCKS_PER_M2} blocs/m², pas une estimation directe du modèle.`,
    );
  }

  if (!materials.length) return null;
  return { ...takeoff, materials, assumptions };
}

export function formatTakeoffForQuotePrompt(takeoff: MaterialTakeoff, webUsed: boolean): string {
  const lines = [
    "=== Métré automatique (indicatif — à valider sur chantier) ===",
    takeoff.work_summary,
    "",
    "Matériaux estimés :",
    ...takeoff.materials.map(
      (m) =>
        `- ${m.name_generic} : ${m.quantity} ${m.unit}${m.specifications ? ` (${m.specifications})` : ""}`,
    ),
  ];

  if (takeoff.labor_hours_estimate != null) {
    lines.push("", `Main-d'œuvre estimée : ~${takeoff.labor_hours_estimate} h`);
  }
  if (takeoff.assumptions.length) {
    lines.push("", "Hypothèses :", ...takeoff.assumptions.map((a) => `- ${a}`));
  }
  if (takeoff.calculation_notes) {
    lines.push("", takeoff.calculation_notes);
  }
  if (webUsed) {
    lines.push("", "(Quantités recoupées avec des sources web — vérification artisan recommandée.)");
  }

  return lines.join("\n");
}

export function takeoffWarnings(takeoff: MaterialTakeoff, webUsed: boolean): string[] {
  const warnings = [
    "Métré automatique — vérifie les quantités et hypothèses sur chantier avant envoi au client.",
  ];
  if (takeoff.assumptions.length) {
    warnings.push(`Hypothèses métré : ${takeoff.assumptions.slice(0, 3).join(" · ")}`);
  }
  if (webUsed) {
    warnings.push("Références web utilisées pour estimer les quantités.");
  }
  return warnings;
}
