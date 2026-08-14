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
2. estimated_hours_min / estimated_hours_max = total des heures de main d'œuvre facturées, toutes personnes confondues, déplacement et préparation inclus. Une équipe de 2 pendant 5 jours = 80 h, pas 5.
3. Repères de durée à respecter :
   - dépannage simple (fuite, prise, serrure, remplacement d'un joint) : 1 à 4 h
   - pose ou remplacement d'un équipement (WC, chauffe-eau, fenêtre, radiateur) : 4 à 12 h
   - rénovation d'une pièce (salle de bains, cuisine, sol d'un séjour) : 40 à 150 h
   - réfection complète d'une toiture, d'une façade ou d'une isolation extérieure, environ 100 m² : 150 à 350 h
   - construction, extension ou gros œuvre : 400 h et plus
4. material_cost_share = part des matériaux dans le coût total (0 pour de la pure main d'œuvre, 0.5 à 0.6 pour de la fourniture-pose lourde comme une toiture ou une menuiserie).
5. confidence = « faible » si la demande reste vague, « bonne » si dimensions et nature sont claires.
6. Ne donne aucun prix : le tarif est appliqué ensuite à partir des taux réels des artisans.
7. Réponds en français, sans jargon inutile.`;

  const userPrompt = `Métier demandé : ${trade}
${params.mediaCount ? `Le client a joint ${params.mediaCount} photo(s) ou vidéo(s) que tu ne peux pas voir : n'en tire aucune conclusion.` : "Aucun média joint."}

${transcript ? `Échange de qualification :\n${transcript}\n` : ""}
Demande finale du client :
${params.description}`;

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
