"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  archiveTenant,
  reactivateTenant,
  resetTenantAccess,
  startImpersonation,
  suspendTenant,
} from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import type { AdminTenantRow } from "@/lib/admin/tenants";
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
        variant="secondary"
        disabled={pending || !tenant.email}
        onClick={() =>
          run(
            () => startImpersonation(tenant.id, false),
            (res) => {
              if (res.url) window.location.href = res.url;
            },
          )
        }
      >
        Se connecter en tant que
      </Button>
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
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant={tenant.accountStatus === "active" ? "default" : "destructive"}>
        {tenant.accountStatus === "active" ? "Actif" : "Suspendu"}
      </Badge>
      <Badge variant="secondary">{plan?.name ?? tenant.subscriptionPlan}</Badge>
      {tenant.subscriptionStatus !== "active" ? (
        <Badge variant="outline">{tenant.subscriptionStatus}</Badge>
      ) : null}
      {tenant.deletedAt ? <Badge variant="outline">Archivé</Badge> : null}
    </div>
  );
}
