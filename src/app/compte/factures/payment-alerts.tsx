import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function paymentErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "stripe":
      return "Le paiement en ligne n’est pas configuré (variable STRIPE_SECRET_KEY).";
    case "stripe_connect_missing":
      return "L’artisan n’a pas encore activé Stripe Connect pour encaisser.";
    case "stripe_connect_not_ready":
      return "L’artisan est en cours de validation Stripe Connect. Réessaie dans quelques instants.";
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

export function PaymentErrorAlert({ code }: { code: string | undefined }) {
  const msg = paymentErrorMessage(code);
  if (!msg) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>Paiement</AlertTitle>
      <AlertDescription>{msg}</AlertDescription>
    </Alert>
  );
}

export function PaymentCanceledAlert({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <Alert>
      <AlertTitle>Paiement annulé</AlertTitle>
      <AlertDescription>Tu peux repayer quand tu veux depuis ce bouton.</AlertDescription>
    </Alert>
  );
}

export function PaymentPendingAlert() {
  return (
    <Alert>
      <AlertTitle>Paiement en cours de confirmation</AlertTitle>
      <AlertDescription>
        Si le statut ne passe pas à « Payée » sous quelques secondes, rafraîchis la page (le traitement peut prendre un instant).
      </AlertDescription>
    </Alert>
  );
}

export function PaymentPaidAlert({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <Alert>
      <AlertTitle>Paiement reçu</AlertTitle>
      <AlertDescription>Merci : ta facture est marquée comme payée.</AlertDescription>
    </Alert>
  );
}
