import { BillingPortalButton } from "@/components/settings/billing-portal-button";
import { SubscriptionPricingGrid } from "@/components/billing/subscription-pricing-grid";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  evaluateSubscriptionAccess,
  SUBSCRIPTION_STATUS_LABELS,
  type SubscriptionStatus,
} from "@/lib/billing/subscription-access";
import {
  findSubscriptionPlan,
  getPlanVoiceMinutes,
  type SubscriptionPlanId,
} from "@/lib/billing/subscription-plans";
import { isStripeConfigured } from "@/lib/stripe/server";
import { isStripeSubscriptionPaymentLinksConfigured } from "@/lib/stripe/subscription-payment-links";

type SubscriptionProfile = {
  subscription_plan: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  voice_minutes_included: number | null;
  voice_minutes_used: number | null;
};

function reasonMessage(reason: string | undefined) {
  switch (reason) {
    case "trial_expired":
      return "Votre essai gratuit de 15 jours est terminé. Choisissez une formule pour continuer à créer des devis et des factures.";
    case "past_due":
      return "Votre dernier paiement a échoué. Régularisez votre abonnement pour retrouver l'accès complet.";
    case "canceled":
      return "Votre abonnement est résilié. Réactivez une formule pour créer de nouveaux devis et factures.";
    default:
      return null;
  }
}

export function SubscriptionSettingsSection({
  profile,
  alerts,
}: {
  profile: SubscriptionProfile;
  alerts?: {
    reason?: string;
    success?: string;
    canceled?: string;
  };
}) {
  const access = evaluateSubscriptionAccess(profile);
  const status = (profile.subscription_status ?? "trialing") as SubscriptionStatus;
  const statusLabel = SUBSCRIPTION_STATUS_LABELS[status] ?? profile.subscription_status ?? "—";
  const planId = (profile.subscription_plan ?? "base") as SubscriptionPlanId;
  const plan = findSubscriptionPlan(planId);
  const blockMessage = reasonMessage(alerts?.reason);
  const stripeEnabled = isStripeConfigured() && isStripeSubscriptionPaymentLinksConfigured();
  const canManageBilling = !!profile.stripe_customer_id?.trim();
  const voiceIncluded = profile.voice_minutes_included ?? getPlanVoiceMinutes(planId);
  const voiceUsed = profile.voice_minutes_used ?? 0;
  const voiceRemaining = Math.max(0, voiceIncluded - voiceUsed);

  return (
    <section className="space-y-8">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold tracking-tight">Abonnement</h2>
        <p className="text-sm text-muted-foreground">
          Votre formule Soline, votre essai gratuit et vos factures d&apos;abonnement.
        </p>
      </div>

      {alerts?.success === "1" ? (
        <Alert>
          <AlertTitle>Paiement en cours de validation</AlertTitle>
          <AlertDescription>
            Merci ! Votre abonnement sera activé dès confirmation du paiement par Stripe.
          </AlertDescription>
        </Alert>
      ) : null}

      {alerts?.canceled === "1" ? (
        <Alert variant="destructive">
          <AlertTitle>Paiement annulé</AlertTitle>
          <AlertDescription>Vous pouvez choisir une formule quand vous le souhaitez.</AlertDescription>
        </Alert>
      ) : null}

      {blockMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Accès limité</AlertTitle>
          <AlertDescription>{blockMessage}</AlertDescription>
        </Alert>
      ) : null}

      {access.allowed && access.status === "trialing" && access.daysRemaining != null ? (
        <Alert>
          <AlertTitle>Période d&apos;essai en cours</AlertTitle>
          <AlertDescription>
            Il vous reste <strong>{access.daysRemaining} jour{access.daysRemaining > 1 ? "s" : ""}</strong>
            {access.trialEndsAt
              ? ` (jusqu'au ${access.trialEndsAt.toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })})`
              : null}
            . Vous pouvez créer des devis et des factures librement pendant cette période.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Statut</dt>
            <dd className="mt-1 text-lg font-semibold">{statusLabel}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Formule</dt>
            <dd className="mt-1 text-lg font-semibold">{plan?.name ?? planId}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Fin d&apos;essai</dt>
            <dd className="mt-1 text-lg font-semibold">
              {access.trialEndsAt
                ? access.trialEndsAt.toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Soline (ce mois)</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {voiceIncluded > 0 ? `${voiceRemaining} / ${voiceIncluded} min` : "Non incluse"}
            </dd>
          </div>
        </dl>

        {canManageBilling ? (
          <div className="mt-5 flex flex-wrap gap-3 border-t pt-5">
            <BillingPortalButton />
            <p className="self-center text-xs text-muted-foreground">
              Moyen de paiement, factures et résiliation — portail sécurisé Stripe.
            </p>
          </div>
        ) : null}
      </div>

      <div>
        <h3 className="font-display text-lg font-semibold tracking-tight">
          {canManageBilling ? "Changer de formule" : "Choisir une formule"}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {stripeEnabled
            ? "Paiement sécurisé par Stripe. Mensuel ou annuel — seule Soline diffère entre les plans."
            : "Le paiement en ligne sera bientôt disponible. Contactez le support pour activer votre formule."}
        </p>
      </div>

      <SubscriptionPricingGrid
        variant="checkout"
        currentPlanId={planId}
        stripeEnabled={stripeEnabled}
      />

      {!stripeEnabled ? (
        <a href="mailto:support@solinebtp.fr" className={buttonVariants({ variant: "outline" })}>
          Contacter le support
        </a>
      ) : null}
    </section>
  );
}
