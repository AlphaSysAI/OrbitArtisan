import "server-only";

import { z } from "zod";

import { mistralChatParse, MISTRAL_EXTRACTION_MODEL } from "@/lib/ai/mistral";

/**
 * Recherche « qui comprend » : l'artisan décrit une situation (« fuite d'eau à côté d'une
 * installation électrique ») et l'IA choisit les fiches utiles dans le catalogue affiché.
 * Testé : le modèle moyen trouve juste en ~1 s et ne force pas de rapprochement
 * (une recherche vectorielle seule ne distinguait pas les demandes hors sujet).
 */

export const SMART_SEARCH_MODEL = process.env.MISTRAL_SHEET_SEARCH_MODEL?.trim() || MISTRAL_EXTRACTION_MODEL;

const responseSchema = z.object({
  matches: z.array(z.object({ id: z.string(), reason: z.string().max(200).optional() })).max(8),
});

export type SmartSearchMatch = { id: string; reason: string };

/** Ce que l'IA lit d'une fiche (pros ou particuliers). */
export type SearchableSheet = { id: string; title: string; summary: string; keywords: string[] };

function catalogLine(sheet: SearchableSheet): string {
  return `${sheet.id} | ${sheet.title} | ${sheet.summary} | ${sheet.keywords.join(", ")}`;
}

export function buildSmartSearchPrompt(sheets: SearchableSheet[], audience: "pro" | "particulier" = "pro"): string {
  const who = audience === "pro" ? "un artisan du bâtiment" : "un particulier qui a un souci dans son logement";
  return `Tu aides ${who} à trouver la bonne fiche dans un catalogue.
Comprends la situation décrite (travail à faire, problème, symptôme, risque) et choisis les fiches qui l'aident directement dans cette situation, de la plus utile à la moins utile (4 au maximum). Une fiche qui ne traite qu'un aspect secondaire ou sans lien avec la situation ne doit pas être proposée.
N'utilise que des identifiants du catalogue. Si aucune fiche ne correspond vraiment, renvoie une liste vide : ne force jamais un rapprochement.
Pour chaque fiche, une raison courte (moins de 15 mots) adressée à cette personne${audience === "particulier" ? ", en la vouvoyant" : ""}.

Catalogue (identifiant | titre | résumé | mots-clés) :
${sheets.map(catalogLine).join("\n")}`;
}

/** Garde les identifiants connus, sans doublon, dans l'ordre donné par l'IA. */
export function keepKnownMatches(
  matches: { id: string; reason?: string }[],
  sheets: SearchableSheet[],
  limit = 4,
): SmartSearchMatch[] {
  const known = new Set(sheets.map((sheet) => sheet.id));
  const seen = new Set<string>();
  return matches
    .filter((m) => known.has(m.id) && !seen.has(m.id) && seen.add(m.id))
    .slice(0, limit)
    .map((m) => ({ id: m.id, reason: m.reason?.trim() ?? "" }));
}

export async function smartSearchSheets(
  query: string,
  sheets: SearchableSheet[],
  audience: "pro" | "particulier" = "pro",
): Promise<SmartSearchMatch[]> {
  if (sheets.length === 0) return [];
  const result = await mistralChatParse(
    responseSchema,
    [
      { role: "system", content: buildSmartSearchPrompt(sheets, audience) },
      { role: "user", content: query },
    ],
    "sheet_matches",
    {
      model: SMART_SEARCH_MODEL,
      jsonExample: `{"matches":[{"id":"…","reason":"…"}]}`,
      temperature: 0,
      maxTokens: 400,
      timeoutMs: 15_000,
      feature: "technical_sheet_search",
    },
  );
  return keepKnownMatches(result.matches, sheets);
}
