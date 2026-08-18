"use client";

import { useTransition } from "react";

import { startSubscriptionCheckout } from "@/app/app/abonnement/actions";
import { buttonVariants } from "@/components/ui/button-variants";
import type { SubscriptionPlan } from "@/lib/billing/subscription-plans";
import { cn } from "@/lib/utils";

export function SubscriptionPlanButton({
  plan,
  currentPlanId,
  stripeEnabled,
}: {
  plan: SubscriptionPlan;
  currentPlanId: string;
  stripeEnabled: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await startSubscriptionCheckout(plan.id);
      if (result.ok) {
        window.location.href = result.url;
        return;
      }
      if (result.error === "stripe_not_configured") {
        window.location.href = "mailto:support@solinebtp.fr?subject=Activation%20abonnement%20Soline";
      }
    });
  }

  const isCurrent = currentPlanId === plan.id;

  return (
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
  );
}
