import "server-only";

import { mistralChat } from "@/lib/ai/mistral";

import { normalizeCallDetails, type CallDetails } from "./call-contact";

const EMPTY: CallDetails = { customerName: null, customerEmail: null, urgent: false, urgencyReason: null };

/**
 * Extrait de la transcription : nom et e-mail de l'appelant (pré-remplissage du
 * devis) et urgence (alerte push prioritaire). Ne devine jamais : champ absent
 * ou douteux → null ; urgence seulement sur des faits explicites.
 */
export async function extractCallDetails(transcript: string): Promise<CallDetails> {
  const trimmed = transcript.trim();
  if (!trimmed) return EMPTY;

  try {
    const raw = await mistralChat({
      messages: [
        {
          role: "system",
          content:
            "Tu analyses la transcription d'un appel entre un client et Soline, la secrétaire virtuelle d'un artisan " +
            "du bâtiment. Réponds uniquement en JSON : " +
            '{"customer_name": string|null, "customer_email": string|null, "is_urgent": boolean, "urgency_reason": string|null}. ' +
            "customer_name : prénom et nom tels que donnés par l'APPELANT (jamais l'artisan ni Soline). " +
            "customer_email : reconstitue l'adresse dictée (« arobase » → @, « point » → ., lettres épelées), " +
            "version confirmée en fin d'échange ; null si incertaine. " +
            "is_urgent = true UNIQUEMENT si l'appelant décrit une situation en cours qui cause des dégâts ou un " +
            "danger et ne peut pas attendre : fuite d'eau active ou dégât des eaux, odeur de gaz, risque électrique " +
            "(étincelles, fils à nu, disjonction permanente), plus de chauffage ou d'eau chaude avec personne " +
            "vulnérable ou par grand froid, toiture ou vitrage cassé exposant aux intempéries, effondrement, " +
            "logement non fermable après effraction. Un simple souhait de rapidité, un devis ou des travaux prévus " +
            "ne sont PAS urgents. urgency_reason : 6 à 12 mots décrivant le fait urgent, sinon null. N'invente rien.",
        },
        { role: "user", content: trimmed.slice(0, 8000) },
      ],
      temperature: 0,
      maxTokens: 250,
      responseFormat: "json_object",
    });
    return normalizeCallDetails(JSON.parse(raw));
  } catch (err) {
    console.error("[voice-details] extraction", err instanceof Error ? err.message : err);
    return EMPTY;
  }
}
