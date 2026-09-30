import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  evaluateSubscriptionAccess,
  SUBSCRIPTION_STATUS_LABELS,
  type SubscriptionStatus,
} from "@/lib/billing/subscription-access";
import { getArtisanShellProfile } from "@/lib/auth/session";

export async function SubscriptionBanner() {
  const profile = await getArtisanShellProfile();
  if (!profile) return null;

  const access = evaluateSubscriptionAccess(profile);
  const status = (profile.subscription_status ?? "incomplete") as SubscriptionStatus;

  if (!access.allowed) {
    if (access.reason === "no_subscription") return null; // bannière dédiée sur la page abonnement
    const title =
      access.reason === "trial_expired"
        ? "Essai terminé"
        : access.reason === "past_due"
          ? "Paiement en attente"
          : "Abonnement inactif";

    return (
      <Alert variant="destructive" className="mb-6">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>
            La création de devis et de factures est suspendue (statut : {SUBSCRIPTION_STATUS_LABELS[status] ?? status}
            ).
          </span>
          <Link href={`/app/reglages?tab=abonnement&reason=${access.reason ?? "subscription"}`} className={buttonVariants({ size: "sm" })}>
            Choisir une formule
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  // Essai Stripe (CB enregistrée) : la formule démarre seule, rien à demander.
  const hasStripeSubscription = !!profile.stripe_subscription_id?.trim();
  if (!hasStripeSubscription && access.status === "trialing" && access.daysRemaining != null && access.daysRemaining <= 5) {
    return (
      <Alert className="mb-6">
        <AlertTitle>Essai gratuit — {access.daysRemaining} jour{access.daysRemaining > 1 ? "s" : ""} restant{access.daysRemaining > 1 ? "s" : ""}</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>Choisissez votre formule avant la fin de l&apos;essai pour continuer sans interruption.</span>
          <Link href="/app/reglages?tab=abonnement" className={buttonVariants({ size: "sm", variant: "outline" })}>
            Voir les formules
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
