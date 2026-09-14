import "server-only";

import { mistralChatParse } from "@/lib/ai/mistral";
import {
  LEAD_QUALIFICATION_JSON_EXAMPLE,
  LEAD_QUALIFICATION_JSON_SCHEMA,
  LeadQualificationSchema,
  type LeadQualification,
} from "@/lib/ai/qualify-lead-schema";
import type { LeadChatMessage } from "@/lib/leads/chat-schema";

/**
 * Analyse la demande d'un particulier (chat de qualification + description
 * libre) pour en extraire de quoi chiffrer : nature, urgence, points
 * techniques, temps de main d'œuvre.
 *
 * Ne lit pas les photos : le modèle de chat n'a pas de vision. Les médias
 * restent joints au lead pour l'artisan.
 */
export async function qualifyLead(params: {
  description: string;
  tradeLabel: string | null;
  categoryLabel: string | null;
  messages?: LeadChatMessage[];
  mediaCount?: number;
}): Promise<LeadQualification> {
  const transcript = (params.messages ?? [])
    .slice(-12)
    .map((m) => `${m.role === "assistant" ? "Question" : "Client"}: ${m.content}`)
    .join("\n");

  const trade = [params.categoryLabel, params.tradeLabel].filter(Boolean).join(" · ") || "non précisé";

  const systemPrompt = `Tu es un économiste de la construction en France. Tu analyses la demande d'un particulier pour préparer un chiffrage.
Règles :
1. N'invente rien : tout ce que tu écris doit venir du texte du client. Ce qui manque va dans missing_info.
2. estimated_hours_min / estimated_hours_max = total des heures de main d'œuvre facturées, toutes personnes confondues, déplacement et préparation inclus. Multiplie par le nombre d'intervenants si une équipe est implicite.
3. Les heures doivent être proportionnées à l'ampleur décrite (intervention ponctuelle, rénovation partielle, chantier complet) — sans extrapoler au-delà du texte client.
4. material_cost_share = part des matériaux dans le coût total, entre 0 et 0,7, selon la part fourniture dans le lot décrit.
5. confidence = « faible » si la demande reste vague, « bonne » si dimensions et nature sont claires.
6. Ne donne aucun prix : le tarif est appliqué ensuite à partir des taux réels des artisans.
7. Réponds en français, sans jargon inutile.`;

  const userPrompt = `Métier demandé : ${trade}
${params.mediaCount ? `Le client a joint ${params.mediaCount} photo(s) ou vidéo(s) que tu ne peux pas voir : n'en tire aucune conclusion.` : "Aucun média joint."}

${transcript ? `Échange de qualification (questions/réponses — source principale pour le détail) :\n${transcript}\n` : ""}
Demande reformulée transmise aux artisans :
${params.description}

Consigne : extrais chaque détail concret (localisation, dimensions, quantités, urgence, matériaux) depuis l'échange ET la description. Ne généralise pas.`;

  const qualification = await mistralChatParse(
    LeadQualificationSchema,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    "lead_qualification",
    {
      temperature: 0.2,
      jsonSchema: LEAD_QUALIFICATION_JSON_SCHEMA,
      jsonExample: LEAD_QUALIFICATION_JSON_EXAMPLE,
    },
  );

  // Bornes incohérentes (le modèle inverse parfois min et max).
  if (qualification.estimated_hours_max < qualification.estimated_hours_min) {
    const { estimated_hours_min: min, estimated_hours_max: max } = qualification;
    qualification.estimated_hours_min = max;
    qualification.estimated_hours_max = min;
  }

  return qualification;
}
