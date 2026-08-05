import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { paymentErrorMessage } from "@/lib/stripe/user-messages";

export { paymentErrorMessage };

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
