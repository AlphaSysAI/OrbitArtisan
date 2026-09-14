import "server-only";

import { z } from "zod";

import { mistralChatParse } from "@/lib/ai/mistral";
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
    labor_hours_estimate: { type: "number", description: "Heures MO estimées" },
    calculation_notes: { type: "string" },
  },
  required: ["work_summary", "assumptions", "materials", "calculation_notes"],
};

/** Détecte une description de chantier avec dimensions (métré automatique utile). */
export function needsMaterialTakeoff(instruction: string): boolean {
  const text = instruction.trim();
  if (text.length < 12) return false;

  const hasDimension =
    /\d+[,.]?\d*\s*(m(?:l|²|³|ètre|eter|ètres|eters)?|cm|mm)\b/i.test(text) ||
    /\d+\s*[x×]\s*\d+/i.test(text) ||
    /\d+[,.]?\d*\s*m\s*lin/i.test(text);

  const hasWork =
    /mur|parpaing|agglo|brique|bloc|dalle|chape|toiture|carrelage|enduit|cloison|fondation|terrasse|maçonnerie|maconnerie|beton|béton|linteau|poteau|hourdis|planelle/i.test(
      text,
    );

  return hasDimension && hasWork;
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
- Utilise des hypothèses standards FR si non précisées (ex. parpaing creux 20×20×50 cm, ~10 U/m² de mur, +8 à 12 % chute).
- Détaille les hypothèses dans "assumptions" (dimensions bloc, épaisseur joint, ouvertures non déduites si absentes, etc.).
- "materials" : noms génériques en français, quantités arrondies à l'entier supérieur pour les U/sacs.
- "unit" : U, sacs, m³, kg, L, ml, m²…
- "labor_hours_estimate" : heures MO réalistes pour l'ouvrage décrit.
- "calculation_notes" : rappel court que le métré est indicatif et doit être validé sur site.
- Si des références web sont fournies, croise-les avec ton expertise ; ne copie pas aveuglément.
- Ne liste pas d'outillage consommable mineur (seaux, truelles) sauf si quantités significatives.`;

  const userParts = [`Description des travaux :\n${instruction}`];
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
  "assumptions": ["Parpaing 20×20×50 cm", "10 % chute", "Pas d'ouverture déduite"],
  "materials": [
    { "name_generic": "Parpaing creux", "quantity": 440, "unit": "U", "specifications": "20×20×50" },
    { "name_generic": "Mortier ciment", "quantity": 12, "unit": "sacs", "specifications": "35 kg" },
    { "name_generic": "Sable", "quantity": 1.2, "unit": "m³", "specifications": null }
  ],
  "labor_hours_estimate": 16,
  "calculation_notes": "Métré indicatif — confirmer métrés et accès sur chantier."
}`,
    },
  );

  if (!takeoff?.materials.length) return null;
  return takeoff;
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
