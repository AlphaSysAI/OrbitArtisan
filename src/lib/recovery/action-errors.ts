/** Messages utilisateur des erreurs renvoyées par les Server Actions de recouvrement. */
const RECOVERY_ERROR_MESSAGES: Record<string, string> = {
  auth: "Session expirée, reconnecte-toi.",
  profile: "Profil artisan introuvable.",
  not_found: "Facture introuvable.",
  load_failed: "Impossible de charger la facture.",
  profile_incomplete:
    "Complète l'adresse postale de ton entreprise dans les réglages : elle est obligatoire pour un envoi recommandé.",
  debtor_address_missing:
    "L'adresse postale complète du client est manquante. Renseigne-la avant l'envoi du recommandé.",
  invalid_status: "Cette facture doit être émise et impayée pour lancer un recouvrement.",
  invalid_amount: "Le montant de la facture est invalide.",
  already_sent: "Une mise en demeure est déjà en cours pour cette facture.",
  already_paid: "Cette facture est déjà réglée.",
  already_submitted: "Ce dossier a déjà été transmis au recouvrement.",
  consent_required: "Tu dois accepter le mandat de recouvrement pour continuer.",
  extra_cost_consent_required:
    "Ton recommandé inclus ce mois-ci est déjà utilisé : confirme la refacturation pour envoyer.",
  formal_notice_required:
    "Envoie d'abord une mise en demeure, ou attends 40 jours de retard de paiement.",
  pdf_failed: "La génération du courrier a échoué.",
  storage_failed: "L'archivage du document a échoué.",
  send_failed: "L'envoi du recommandé a été refusé par La Poste. Vérifie l'adresse du client.",
  submit_failed: "La transmission du dossier a échoué.",
  persist_failed: "L'enregistrement a échoué.",
  missing_debtor_siren: "Le SIREN du client professionnel est requis pour le recouvrement.",
  missing_debtor_address: "L'adresse postale du client est requise pour le recouvrement.",
  missing_documents: "Aucune pièce justificative n'a pu être constituée.",
  missing_invoice_document: "La facture n'a pas pu être jointe au dossier.",
  invoice_document_failed: "La facture n'a pas pu être régénérée.",
  not_configured: "Le service n'est pas encore configuré. Contacte le support.",
  service_unavailable: "Service temporairement indisponible.",
};

export function recoveryErrorMessage(code: string): string {
  return RECOVERY_ERROR_MESSAGES[code] ?? "Une erreur est survenue. Réessaie dans un instant.";
}
