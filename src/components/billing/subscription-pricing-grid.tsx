"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { SubscriptionPlanButton } from "@/app/app/abonnement/subscription-plan-button";
import { BillingIntervalToggle } from "@/components/billing/billing-interval-toggle";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  formatPriceHtEur,
  getPlanAnnualSavingsPercent,
  SUBSCRIPTION_PLANS,
  type BillingInterval,
} from "@/lib/billing/subscription-plans";
import { cn } from "@/lib/utils";

type SubscriptionPricingGridProps =
  | {
      variant: "landing";
      registerUrl: string;
    }
  | {
      variant: "checkout";
      currentPlanId: string;
      stripeEnabled: boolean;
    };

export function SubscriptionPricingGrid(props: SubscriptionPricingGridProps) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  return (
    <div className="space-y-8">
      <div className="flex justify-center">
        <BillingIntervalToggle value={interval} onChange={setInterval} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {SUBSCRIPTION_PLANS.map((plan) => {
          const price =
            interval === "annual" ? plan.priceAnnualHtEur : plan.priceMonthlyHtEur;
          const priceLabel = interval === "annual" ? "HT / an" : "HT / mois";
          const savingsPercent =
            interval === "annual" ? getPlanAnnualSavingsPercent(plan) : null;

          return (
            <article
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm",
                props.variant === "landing" && "rounded-3xl bg-white sm:p-8",
                plan.popular
                  ? props.variant === "landing"
                    ? "border-2 border-orange-400 shadow-lg shadow-orange-500/10"
                    : "border-orange-300 ring-1 ring-orange-200"
                  : props.variant === "landing"
                    ? "border-slate-200"
                    : undefined,
              )}
            >
              {plan.popular ? (
                <span
                  className={cn(
                    "absolute -top-3 rounded-full bg-orange-500 px-3 py-0.5 text-xs font-semibold text-white",
                    props.variant === "landing" ? "left-6 py-1" : "left-1/2 -translate-x-1/2",
                  )}
                >
                  {props.variant === "landing" ? "Le plus populaire" : "Populaire"}
                </span>
              ) : null}

              {props.variant === "landing" ? (
                <p
                  className={cn(
                    "text-sm font-semibold uppercase tracking-wider",
                    plan.popular ? "text-orange-600" : "text-slate-500",
                  )}
                >
                  Plan {plan.name}
                </p>
              ) : (
                <h3 className="font-display text-xl font-semibold">{plan.name}</h3>
              )}

              <p className="mt-2 flex items-baseline gap-1">
                <span
                  className={cn(
                    "text-4xl font-bold tabular-nums",
                    props.variant === "landing" && "text-slate-900",
                  )}
                >
                  {formatPriceHtEur(price)} €
                </span>
                <span className={props.variant === "landing" ? "text-slate-500" : "text-muted-foreground"}>
                  {priceLabel}
                </span>
              </p>

              {savingsPercent != null && savingsPercent > 0 ? (
                <p className="mt-1 text-xs font-medium text-orange-600">
                  Économisez {savingsPercent} % vs mensuel
                </p>
              ) : null}

              <p
                className={cn(
                  "mt-3 text-sm",
                  props.variant === "landing" ? "text-slate-600" : "text-muted-foreground",
                )}
              >
                {plan.description}
              </p>

              <ul
                className={cn(
                  "mt-6 flex-1 space-y-2 text-sm",
                  props.variant === "landing" && "space-y-3 text-slate-600",
                )}
              >
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        props.variant === "landing" ? "text-emerald-600" : "text-orange-500",
                      )}
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                {props.variant === "landing" ? (
                  <a
                    href={props.registerUrl}
                    className={cn(
                      buttonVariants({ size: "lg" }),
                      "w-full",
                      plan.popular
                        ? "border-orange-500 bg-orange-500 text-white hover:bg-orange-600"
                        : plan.id === "premium"
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
                    )}
                  >
                    {plan.id === "base" ? "Démarrer l'essai gratuit" : `Choisir ${plan.name}`}
                  </a>
                ) : (
                  <SubscriptionPlanButton
                    plan={plan}
                    billingInterval={interval}
                    currentPlanId={props.currentPlanId}
                    stripeEnabled={props.stripeEnabled}
                  />
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
