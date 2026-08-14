const AI_ERROR_MESSAGES: Record<string, string> = {
  missing_conversation_id: "Conversation manquante.",
  missing_message: "Écris ou dicte une demande.",
  not_authenticated: "Session expirée — reconnecte-toi.",
  not_artisan: "Réservé à l’espace artisan.",
  conversation_forbidden: "Accès à la conversation refusé.",
  no_messages: "Aucun message dans cette conversation.",
  empty_response: "Réponse IA vide.",
  empty_ai_response: "Réponse IA vide.",
  ai_failed: "Échec de l’IA — réessaie.",
  ai_auth_failed: "Clé API Mistral invalide — contacte l’administrateur ou vérifie la configuration.",
  ai_schema_failed: "L’IA a répondu mais le format était incomplet. Réessaie ou crée le devis manuellement.",
  ai_invalid_json: "Réponse IA illisible. Réessaie dans quelques instants.",
  ai_parse_failed: "Analyse IA impossible. Réessaie ou crée le devis manuellement.",
  missing_quote_id: "Devis introuvable.",
  quote_not_found: "Devis introuvable.",
  forbidden: "Accès refusé.",
};

export function aiErrorMessage(code: string | null | undefined, fallback = "Erreur IA — réessaie."): string {
  if (!code) return fallback;
  return AI_ERROR_MESSAGES[code] ?? fallback;
}
