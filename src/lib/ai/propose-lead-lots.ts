import "server-only";

import { z } from "zod";

import { mistralChatParse } from "@/lib/ai/mistral";
import type { LeadChatMessage } from "@/lib/leads/chat-schema";
import { MAX_LEAD_LOTS, parseLeadLots, type LeadLot } from "@/lib/leads/lots";
import { TRADE_CATEGORIES } from "@/lib/trades/taxonomy";

const ProposalSchema = z.object({
  lots: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.unknown())),
});

const JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    lots: {
      type: "array",
      maxItems: MAX_LEAD_LOTS,
      items: {
        type: "object",
        properties: {
          trade_category: { type: "string", description: "Identifiant de catégorie de la nomenclature" },
          trade: { type: "string", description: "Identifiant de métier de cette catégorie" },
          summary: { type: "string", description: "Travaux de CE métier uniquement, pour l'artisan" },
        },
        required: ["trade_category", "trade", "summary"],
      },
    },
  },
  required: ["lots"],
};

/** Nomenclature compacte : « gros-oeuvre (Gros œuvre & structure) : macon=Maçon, … ». */
function taxonomyForPrompt(): string {
  return TRADE_CATEGORIES.filter((c) => c.id !== "autre")
    .map((c) => `- ${c.id} (${c.label}) : ${c.trades.map((t) => `${t.id}=${t.label}`).join(", ")}`)
    .join("\n");
}

/**
 * Widget public : corps d'état nécessaires à la demande du particulier (proposés,
 * puis validés par le client). Chaque lot porte un résumé limité à son métier, seul
 * texte transmis à l'artisan retenu pour ce lot.
 * Repli : le métier choisi par le client, avec sa description complète.
 */
export async function proposeLeadLots(input: {
  description: string;
  messages?: LeadChatMessage[];
  primary: { trade_category: string; trade: string | null };
}): Promise<LeadLot[]> {
  const fallback: LeadLot[] = [{ ...input.primary, summary: input.description.slice(0, 800) }];
  const transcript = (input.messages ?? [])
    .slice(-12)
    .map((m) => `${m.role === "assistant" ? "Question" : "Client"}: ${m.content}`)
    .join("\n");

  try {
    const proposal = await mistralChatParse(
      ProposalSchema,
      [
        {
          role: "system",
          content: `Tu es conducteur de travaux TCE en France. Un particulier décrit son projet : liste les corps d'état
(métiers) nécessaires pour le réaliser, chacun avec le résumé des travaux qui le concernent.

Règles :
1. Uniquement les métiers nécessaires aux travaux DÉCRITS (ex. « maison neuve » : maçon, charpentier / couvreur,
   menuisier, plaquiste, plombier, électricien… ; « fuite sous l'évier » : plombier seul). Rien de décoratif ou
   optionnel non demandé.
2. Un métier par lot, identifiants EXACTS de la nomenclature ci-dessous. Pas deux lots pour le même travail.
3. Le métier choisi par le client (indiqué) est un indice, pas une obligation : retire-le s'il ne correspond à
   aucun travail décrit.
4. summary : 2 à 5 phrases destinées au seul artisan du lot — ses travaux uniquement, avec toutes les données utiles
   tirées de la demande (surfaces, dimensions, matériaux souhaités, état existant, accès, délais). N'invente rien et
   ne décris pas les travaux des autres lots.
5. Ordre chronologique du chantier. ${MAX_LEAD_LOTS} lots maximum.

Nomenclature (catégorie : métier=libellé) :
${taxonomyForPrompt()}`,
        },
        {
          role: "user",
          content: [
            `Métier choisi par le client : ${input.primary.trade_category}${input.primary.trade ? ` / ${input.primary.trade}` : ""}`,
            transcript ? `Échange de qualification :\n${transcript}` : "",
            `Demande :\n${input.description}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      "lead_lots",
      {
        temperature: 0.1,
        maxTokens: 2000,
        jsonSchema: JSON_SCHEMA,
        jsonExample: `{"lots":[{"trade_category":"plomberie-chauffage","trade":"plombier","summary":"Remplacement du siphon et du flexible sous l'évier de cuisine, fuite apparue il y a deux jours."}]}`,
      },
    );
    const lots = parseLeadLots(proposal.lots);
    return lots.length ? lots : fallback;
  } catch (err) {
    console.error("[propose-lead-lots]", err instanceof Error ? err.message : err);
    return fallback;
  }
}
