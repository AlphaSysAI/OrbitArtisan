export function subscriptionCheckoutErrorMessage(error: string | undefined): string {
  switch (error) {
    case "stripe_not_configured":
      return "Le paiement en ligne n'est pas configuré. Contactez le support.";
    case "missing_env":
      return "Les liens de paiement Stripe ne sont pas configurés sur le serveur.";
    case "invalid_payment_link":
      return "Lien de paiement Stripe invalide. Contactez le support.";
    case "missing_profile":
      return "Profil artisan introuvable. Complétez d'abord votre activité dans Réglages.";
    case "auth_required":
      return "Connectez-vous pour souscrire à une formule.";
    case "already_subscribed":
      return "Vous avez déjà un abonnement : changez de formule via le bouton « Gérer paiement et factures ».";
    case "promo_full":
      return "Les 50 places ambassadeur viennent d'être attribuées. Cliquez à nouveau pour vous abonner au tarif normal.";
    case "promo_expired":
      return "L'offre ambassadeur est terminée. Cliquez à nouveau pour vous abonner au tarif normal.";
    case "promo_not_configured":
    case "price_not_found":
      return "Le tarif ambassadeur n'est pas encore disponible au paiement. Contactez le support : votre code reste enregistré.";
    case "invalid_plan":
    case "invalid_interval":
      return "Formule sélectionnée invalide.";
    default:
      return "Impossible d'ouvrir la page de paiement. Réessayez ou contactez le support.";
  }
}
