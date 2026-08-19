"use client";

import { useState } from "react";

import { startSubscriptionCheckout } from "@/app/app/abonnement/actions";
import { subscriptionCheckoutErrorMessage } from "@/lib/billing/stripe-checkout-errors";
import { buttonVariants } from "@/components/ui/button-variants";
import type { BillingInterval, SubscriptionPlan } from "@/lib/billing/subscription-plans";
import { cn } from "@/lib/utils";

export function SubscriptionPlanButton({
  plan,
  billingInterval,
  currentPlanId,
  stripeEnabled,
}: {
  plan: SubscriptionPlan;
  billingInterval: BillingInterval;
  currentPlanId: string;
  stripeEnabled: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setErrorMessage(null);

    try {
      const result = await startSubscriptionCheckout(plan.id, billingInterval);
      if (result.ok) {
        window.location.assign(result.url);
        return;
      }
      setErrorMessage(subscriptionCheckoutErrorMessage(result.error));
    } catch {
      setErrorMessage(subscriptionCheckoutErrorMessage(undefined));
    } finally {
      setPending(false);
    }
  }

  const isCurrent = currentPlanId === plan.id;

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending || isCurrent}
        onClick={handleClick}
        className={cn(
          buttonVariants({ size: "lg" }),
          "w-full",
          plan.popular
            ? "border-orange-500 bg-orange-500 text-white hover:bg-orange-600"
            : plan.id === "premium"
              ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
              : undefined,
        )}
      >
        {pending
          ? "Redirection…"
          : isCurrent
            ? "Formule actuelle"
            : stripeEnabled
              ? `Choisir ${plan.name}`
              : `Demander ${plan.name}`}
      </button>
      {errorMessage ? <p className="text-center text-xs text-destructive">{errorMessage}</p> : null}
    </div>
  );
}
