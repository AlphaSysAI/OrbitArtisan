import "server-only";

import { mistralChatParse } from "@/lib/ai/mistral";
import { technicalSheetAiResponseSchema } from "@/lib/technical-sheets/sheet-schema";
import type { TechnicalSheetContent } from "@/lib/technical-sheets/types";

/** Modèle plus fiable que celui par défaut : le contenu technique doit être juste. */
export const TECHNICAL_SHEET_MODEL = process.env.MISTRAL_SHEET_MODEL?.trim() || "mistral-large-latest";

const SYSTEM_PROMPT = `Tu rédiges des fiches techniques de chantier pour des artisans du bâtiment professionnels en France.

Règles :
- Public : professionnels qualifiés. Ton factuel, phrases courtes, vocabulaire du métier.
- Pratiques conformes aux règles de l'art françaises : DTU, NF C 15-100, réglementation en vigueur.
- Cite les normes par leur référence et leur objet uniquement, sans jamais en recopier le texte.
- Si tu n'es pas certain d'une valeur chiffrée (section, distance, pression, durée), ne l'invente pas : renvoie à la norme ou à la notice du fabricant.
- Commence toujours par la sécurité : consignation électrique, coupure d'eau ou de gaz, protections individuelles, amiante (bâtiments d'avant juillet 1997), plomb (avant 1949), travail en hauteur.
- Signale les habilitations ou qualifications obligatoires (habilitation électrique, attestation de capacité fluides frigorigènes, qualification gaz, IRVE…).
- Étapes dans l'ordre réel du chantier, chacune avec ses actions et, si utile, un point de vigilance.
- Termine par les contrôles de fin de travaux.
- Refuse (refused = true, avec la raison) toute demande sans rapport avec le bâtiment, ou qui viserait à contourner la sécurité ou la réglementation.
- Réponds en français.`;

const JSON_EXAMPLE = `{
  "refused": false,
  "sheet": {
    "title": "…",
    "summary": "…",
    "duration": "…",
    "tools": ["…"],
    "materials": ["…"],
    "safety": ["…"],
    "steps": [{ "title": "…", "details": ["…"], "warning": "…" }],
    "checks": ["…"],
    "norms": [{ "ref": "NF DTU …", "label": "…" }]
  }
}`;

export type GenerateSheetResult =
  | { ok: true; sheet: TechnicalSheetContent; model: string }
  | { ok: false; error: "refused"; reason: string }
  | { ok: false; error: "ai_failed" };

export async function generateTechnicalSheet(params: {
  request: string;
  tradeLabel: string | null;
}): Promise<GenerateSheetResult> {
  const context = params.tradeLabel ? `Métier de l'artisan : ${params.tradeLabel}.\n` : "";
  try {
    const result = await mistralChatParse(
      technicalSheetAiResponseSchema,
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${context}Rédige la fiche technique : ${params.request}` },
      ],
      "technical_sheet",
      {
        model: TECHNICAL_SHEET_MODEL,
        jsonExample: JSON_EXAMPLE,
        temperature: 0.2,
        maxTokens: 4000,
        timeoutMs: 50_000,
        feature: "technical_sheet",
      },
    );
    if (result.refused || !result.sheet) {
      return { ok: false, error: "refused", reason: result.refusalReason?.trim() || "Demande hors du champ des fiches techniques." };
    }
    return { ok: true, sheet: result.sheet, model: TECHNICAL_SHEET_MODEL };
  } catch (error) {
    console.error("[technical-sheet] generation failed", error instanceof Error ? error.message : error);
    return { ok: false, error: "ai_failed" };
  }
}
