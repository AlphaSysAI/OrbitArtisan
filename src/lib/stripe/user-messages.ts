export function paymentErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "stripe":
      return "Le paiement en ligne n’est pas configuré sur ce site.";
    case "stripe_connect_missing":
      return "L’artisan n’a pas encore activé les paiements en ligne pour encaisser.";
    case "stripe_connect_not_ready":
      return "L’artisan est en cours d’activation des paiements en ligne. Réessaie dans quelques instants.";
    case "forbidden":
      return "Tu n’as pas accès à cette facture.";
    case "status":
      return "Cette facture ne peut plus être payée en ligne (déjà payée ou non envoyée).";
    case "amount":
      return "Montant invalide pour un paiement.";
    case "session":
      return "Impossible de démarrer la session de paiement. Réessaie plus tard.";
    case "missing":
      return "Requête invalide.";
    default:
      return "Une erreur est survenue.";
  }
}

export function withdrawErrorMessage(code: string | undefined): string {
  switch (code) {
    case "payouts_not_enabled":
      return "Ton compte de paiement n’a pas encore l’autorisation de versement.";
    case "stripe_not_configured":
      return "Les paiements en ligne ne sont pas configurés sur ce site.";
    case "missing_stripe_account":
      return "Aucun compte de paiement associé à ton activité.";
    case "balance_failed":
      return "Impossible de lire le solde disponible. Réessaie dans quelques instants.";
    case "payout_failed":
      return "Le versement a échoué — réessaie plus tard.";
    case "0":
      return "Aucun fonds disponible à retirer pour le moment.";
    default:
      return "Réessaie dans quelques instants.";
  }
}
