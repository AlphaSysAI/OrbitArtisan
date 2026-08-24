import "server-only";

import { mistralChat } from "@/lib/ai/mistral";

/**
 * Résumé court d'un appel téléphonique pour l'artisan (affichage liste appels).
 */
export async function summarizeCallTranscript(transcript: string): Promise<string> {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return "Appel reçu — aucun détail transcript disponible.";
  }

  try {
    const summary = await mistralChat({
      messages: [
        {
          role: "system",
          content:
            "Tu résumes des appels téléphoniques entre un client et la secrétaire IA d'un artisan du bâtiment. " +
            "Réponds en français, 3 à 5 phrases maximum, factuelles. Mentionne le besoin, l'urgence, le lieu si cité, " +
            "et les coordonnées collectées. Pas de markdown.",
        },
        { role: "user", content: trimmed.slice(0, 8000) },
      ],
      temperature: 0.2,
    });

    const text = summary?.trim();
    return text || trimmed.slice(0, 500);
  } catch (err) {
    console.error("[voice-summary]", err instanceof Error ? err.message : err);
    return trimmed.slice(0, 500);
  }
}
