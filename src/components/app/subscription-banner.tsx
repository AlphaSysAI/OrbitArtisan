import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  evaluateSubscriptionAccess,
  SUBSCRIPTION_STATUS_LABELS,
  type SubscriptionStatus,
} from "@/lib/billing/subscription-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function SubscriptionBanner() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_status, trial_ends_at, account_status, deleted_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) return null;

  const access = evaluateSubscriptionAccess(profile);
  const status = (profile.subscription_status ?? "trialing") as SubscriptionStatus;

  if (!access.allowed) {
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
          <Link href={`/app/abonnement?reason=${access.reason ?? "subscription"}`} className={buttonVariants({ size: "sm" })}>
            Choisir une formule
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  if (access.status === "trialing" && access.daysRemaining != null && access.daysRemaining <= 5) {
    return (
      <Alert className="mb-6">
        <AlertTitle>Essai gratuit — {access.daysRemaining} jour{access.daysRemaining > 1 ? "s" : ""} restant{access.daysRemaining > 1 ? "s" : ""}</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>Choisissez votre formule avant la fin de l&apos;essai pour continuer sans interruption.</span>
          <Link href="/app/abonnement" className={buttonVariants({ size: "sm", variant: "outline" })}>
            Voir les formules
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
