"use client";

import { useTransition } from "react";
import { CreditCard } from "lucide-react";

import { openStripeBillingPortal } from "@/app/app/abonnement/actions";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export function BillingPortalButton({ className }: { className?: string }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await openStripeBillingPortal();
      if (result.ok) {
        window.location.href = result.url;
        return;
      }
      if (result.error === "no_stripe_customer") {
        alert("Aucun abonnement Stripe actif. Choisissez d’abord une formule ci-dessous.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2", className)}
    >
      <CreditCard className="size-4" />
      {pending ? "Redirection…" : "Gérer paiement et factures"}
    </button>
  );
}
