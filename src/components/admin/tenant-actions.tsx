"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  archiveTenant,
  reactivateTenant,
  resetTenantAccess,
  suspendTenant,
} from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import type { AdminTenantRow } from "@/lib/admin/tenants";
import { SUBSCRIPTION_STATUS_LABELS, type SubscriptionStatus } from "@/lib/billing/subscription-access";
import { findSubscriptionPlan } from "@/lib/billing/subscription-plans";

export function TenantActions({ tenant }: { tenant: AdminTenantRow }) {
  const [pending, startTransition] = useTransition();

  function run(
    action: () => Promise<{ ok: boolean; error?: string; url?: string }>,
    onSuccess?: (res: { ok: true; url?: string }) => void,
  ) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error ?? "Action impossible");
        return;
      }
      onSuccess?.(res as { ok: true; url?: string });
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Link href={`/admin/tenants/${tenant.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
        Détails
      </Link>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending || !tenant.email}
        onClick={() =>
          run(
            () => resetTenantAccess(tenant.id),
            (res) => {
              if (res.url) window.open(res.url, "_blank");
              toast.success("Lien de réinitialisation ouvert");
            },
          )
        }
      >
        Réinitialiser accès
      </Button>
      {tenant.accountStatus === "active" ? (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() => run(() => suspendTenant(tenant.id), () => toast.success("Compte suspendu"))}
        >
          Suspendre
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => run(() => reactivateTenant(tenant.id), () => toast.success("Compte réactivé"))}
        >
          Réactiver
        </Button>
      )}
      {!tenant.deletedAt ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => archiveTenant(tenant.id), () => toast.success("Compte archivé"))}
        >
          Archiver
        </Button>
      ) : null}
    </div>
  );
}

export function TenantStatusBadges({ tenant }: { tenant: AdminTenantRow }) {
  const plan = findSubscriptionPlan(tenant.subscriptionPlan);
  // « incomplete » = aucune formule souscrite (jamais passé par Stripe) : subscription_plan
  // n'est alors qu'une valeur par défaut, à ne pas afficher comme une formule.
  const noSubscription = tenant.subscriptionStatus === "incomplete";
  const statusLabel = SUBSCRIPTION_STATUS_LABELS[tenant.subscriptionStatus as SubscriptionStatus] ?? tenant.subscriptionStatus;
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant={tenant.accountStatus === "active" ? "secondary" : "destructive"}>
        {tenant.accountStatus === "active" ? "Compte ouvert" : "Compte suspendu"}
      </Badge>
      {noSubscription ? (
        <Badge variant="outline">Sans formule</Badge>
      ) : (
        <>
          <Badge variant={tenant.subscriptionStatus === "active" || tenant.subscriptionStatus === "trialing" ? "default" : "outline"}>
            {plan?.name ?? tenant.subscriptionPlan}
          </Badge>
          {tenant.subscriptionStatus !== "active" ? <Badge variant="outline">{statusLabel}</Badge> : null}
        </>
      )}
      {tenant.deletedAt ? <Badge variant="outline">Archivé</Badge> : null}
    </div>
  );
}
