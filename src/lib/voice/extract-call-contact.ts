import "server-only";

import { mistralChat } from "@/lib/ai/mistral";

import { normalizeCallContact, type CallContact } from "./call-contact";

/**
 * Extrait le nom et l'e-mail de l'appelant depuis la transcription, pour
 * pré-remplir le devis. Ne devine jamais : champ absent ou douteux → null.
 */
export async function extractCallContact(transcript: string): Promise<CallContact> {
  const trimmed = transcript.trim();
  if (!trimmed) return { customerName: null, customerEmail: null };

  try {
    const raw = await mistralChat({
      messages: [
        {
          role: "system",
          content:
            "Tu extrais les coordonnées de l'APPELANT (le client) d'une transcription d'appel entre un client et " +
            "Soline, la secrétaire virtuelle d'un artisan. Réponds uniquement en JSON : " +
            '{"customer_name": string|null, "customer_email": string|null}. ' +
            "customer_name : prénom et nom tels que donnés par l'appelant (jamais ceux de l'artisan ou de Soline). " +
            "customer_email : reconstitue l'adresse dictée (« arobase » → @, « point » → ., lettres épelées), " +
            "en privilégiant la version confirmée en fin d'échange. Si une information n'a pas été donnée ou reste " +
            "incertaine, mets null. N'invente rien.",
        },
        { role: "user", content: trimmed.slice(0, 8000) },
      ],
      temperature: 0,
      maxTokens: 200,
      responseFormat: "json_object",
    });
    return normalizeCallContact(JSON.parse(raw));
  } catch (err) {
    console.error("[voice-contact] extraction", err instanceof Error ? err.message : err);
    return { customerName: null, customerEmail: null };
  }
}
