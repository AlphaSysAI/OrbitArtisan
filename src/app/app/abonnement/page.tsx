import Link from "next/link";
import { Check } from "lucide-react";

import { SubscriptionPlanButton } from "@/app/app/abonnement/subscription-plan-button";
import { AppPageHeader } from "@/components/app/app-page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  evaluateSubscriptionAccess,
  SUBSCRIPTION_STATUS_LABELS,
  type SubscriptionStatus,
} from "@/lib/billing/subscription-access";
import { SUBSCRIPTION_PLANS } from "@/lib/billing/subscription-plans";
import { isStripeConfigured } from "@/lib/stripe/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

export default async function AbonnementPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; success?: string; canceled?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_plan, subscription_status, trial_ends_at, business_name")
    .eq("user_id", user!.id)
    .maybeSingle();

  const access = evaluateSubscriptionAccess(profile ?? null);
  const status = (profile?.subscription_status ?? "trialing") as SubscriptionStatus;
  const statusLabel = SUBSCRIPTION_STATUS_LABELS[status] ?? profile?.subscription_status ?? "—";
  const blockMessage = reasonMessage(sp.reason);
  const stripeEnabled = isStripeConfigured();

  return (
    <div className="space-y-8">
      <AppPageHeader
        title="Abonnement"
        description="Gérez votre formule Soline et votre période d'essai."
      />

      {sp.success === "1" ? (
        <Alert>
          <AlertTitle>Paiement en cours de validation</AlertTitle>
          <AlertDescription>
            Merci ! Votre abonnement sera activé dès confirmation du paiement par Stripe.
          </AlertDescription>
        </Alert>
      ) : null}

      {sp.canceled === "1" ? (
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
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Statut</dt>
            <dd className="mt-1 text-lg font-semibold">{statusLabel}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Formule</dt>
            <dd className="mt-1 text-lg font-semibold capitalize">{profile?.subscription_plan ?? "base"}</dd>
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
        </dl>
      </div>

      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Choisir une formule</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {stripeEnabled
            ? "Paiement sécurisé par Stripe. Vous serez redirigé vers la page de paiement."
            : "Le paiement en ligne sera bientôt disponible. En attendant, contactez le support pour activer votre formule."}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {SUBSCRIPTION_PLANS.map((plan) => (
          <article
            key={plan.id}
            className={`relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm ${
              plan.popular ? "border-orange-300 ring-1 ring-orange-200" : ""
            }`}
          >
            {plan.popular ? (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-orange-500 px-3 py-0.5 text-xs font-semibold text-white">
                Populaire
              </span>
            ) : null}
            <h3 className="font-display text-xl font-semibold">{plan.name}</h3>
            <p className="mt-2 flex items-baseline gap-1">
              <span className="text-4xl font-bold tabular-nums">{plan.priceHtEur} €</span>
              <span className="text-muted-foreground">HT / mois</span>
            </p>
            <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>
            <ul className="mt-6 flex-1 space-y-2 text-sm">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-orange-500" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <SubscriptionPlanButton
                plan={plan}
                currentPlanId={profile?.subscription_plan ?? "base"}
                stripeEnabled={stripeEnabled}
              />
            </div>
          </article>
        ))}
      </div>

      {!stripeEnabled ? (
        <div className="flex flex-wrap gap-3">
          <a href="mailto:support@solinebtp.fr" className={buttonVariants({ variant: "outline" })}>
            Contacter le support
          </a>
          <Link href="/app" className={buttonVariants({ variant: "ghost" })}>
            Retour à l&apos;accueil
          </Link>
        </div>
      ) : null}
    </div>
  );
}
