"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  archiveTenant,
  reactivateTenant,
  resetTenantAccess,
  restoreTenant,
  suspendTenant,
  updateTenantPlanAction,
  updateTenantProfileAction,
} from "@/app/admin/actions";
import { ConfirmButton } from "@/components/admin/ui/confirm-button";
import { copyToClipboard } from "@/components/admin/ui/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SUBSCRIPTION_LABEL, type AdminSubscriptionStatus } from "@/lib/admin/labels";
import { SUBSCRIPTION_PLANS } from "@/lib/billing/subscription-plans";

type Result = { ok: true; url?: string } | { ok: false; error: string };

function useAdminAction() {
  const router = useRouter();
  return async (action: () => Promise<Result>, success: string) => {
    const res = await action();
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(success);
    router.refresh();
    return true;
  };
}

/** Actions sur l'accès du compte (fiche artisan). */
export function TenantAccessActions({
  profileId,
  email,
  accountStatus,
  archived,
  businessName,
}: {
  profileId: string;
  email: string | null;
  accountStatus: "active" | "suspended";
  archived: boolean;
  businessName: string;
}) {
  const run = useAdminAction();
  const [pending, start] = useTransition();
  const who = businessName || email || "ce compte";

  if (archived) {
    return (
      <ConfirmButton
        title="Restaurer ce compte ?"
        description={`${who} redevient visible et accessible. Le numéro Soline libéré à l'archivage n'est pas rendu.`}
        confirmLabel="Restaurer"
        onConfirm={() => run(() => restoreTenant(profileId), "Compte restauré")}
      >
        Restaurer
      </ConfirmButton>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending || !email}
        title={email ? undefined : "Aucun e-mail sur ce compte"}
        onClick={() =>
          start(async () => {
            const res = await resetTenantAccess(profileId);
            if (!res.ok) return void toast.error(res.error);
            // Jamais ouvert ici : le lien connecterait l'admin au compte de l'artisan.
            if (res.url) await copyToClipboard(res.url, "Lien de réinitialisation copié : à transmettre à l'artisan");
          })
        }
      >
        Copier un lien de réinitialisation
      </Button>
      {accountStatus === "active" ? (
        <ConfirmButton
          destructive
          title="Suspendre ce compte ?"
          description={`${who} ne pourra plus accéder à son espace. Son abonnement Stripe n'est pas modifié.`}
          confirmLabel="Suspendre"
          onConfirm={() => run(() => suspendTenant(profileId), "Compte suspendu")}
        >
          Suspendre
        </ConfirmButton>
      ) : (
        <ConfirmButton
          title="Réactiver ce compte ?"
          description={`${who} retrouve l'accès à son espace.`}
          confirmLabel="Réactiver"
          onConfirm={() => run(() => reactivateTenant(profileId), "Compte réactivé")}
        >
          Réactiver
        </ConfirmButton>
      )}
      <ConfirmButton
        destructive
        variant="ghost"
        title="Archiver ce compte ?"
        description={`${who} disparaît de la liste, perd l'accès et son numéro Soline est libéré (quarantaine). Restaurable ensuite, mais sans le numéro.`}
        confirmLabel="Archiver"
        onConfirm={() => run(() => archiveTenant(profileId), "Compte archivé")}
      >
        Archiver
      </ConfirmButton>
    </div>
  );
}

const PROFILE_FIELDS = [
  { name: "business_name", label: "Raison sociale", required: true },
  { name: "name", label: "Nom du contact" },
  { name: "phone", label: "Téléphone", inputMode: "tel" as const },
  { name: "siren", label: "SIREN", inputMode: "numeric" as const },
  { name: "siret", label: "SIRET", inputMode: "numeric" as const },
];

export function TenantProfileForm({ profileId, initial }: { profileId: string; initial: Record<string, string> }) {
  const run = useAdminAction();
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const input = Object.fromEntries(PROFILE_FIELDS.map((f) => [f.name, String(fd.get(f.name) ?? "")]));
        start(async () => void (await run(() => updateTenantProfileAction(profileId, input), "Fiche enregistrée")));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {PROFILE_FIELDS.map((f) => (
          <div key={f.name} className={f.name === "business_name" ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
            <Label htmlFor={`t-${f.name}`}>{f.label}</Label>
            <Input id={`t-${f.name}`} name={f.name} defaultValue={initial[f.name] ?? ""} required={f.required} inputMode={f.inputMode} />
          </div>
        ))}
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}

const STATUSES: AdminSubscriptionStatus[] = ["incomplete", "trialing", "active", "past_due", "canceled"];

/** Correction manuelle de l'état d'abonnement (ne touche pas à Stripe). */
export function TenantPlanForm({ profileId, plan, status }: { profileId: string; plan: string; status: string }) {
  const run = useAdminAction();
  const [nextPlan, setNextPlan] = useState(plan);
  const [nextStatus, setNextStatus] = useState(status);
  const changed = nextPlan !== plan || nextStatus !== status;
  const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
  const losesVoice = nextPlan === "base" && plan !== "base";

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="t-plan">Formule</Label>
          <select id="t-plan" className={selectClass} value={nextPlan} onChange={(e) => setNextPlan(e.target.value)}>
            {SUBSCRIPTION_PLANS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-status">Statut</Label>
          <select id="t-status" className={selectClass} value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {SUBSCRIPTION_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ConfirmButton
        disabled={!changed}
        title="Corriger l'abonnement en base ?"
        description={
          <>
            Stripe n&apos;est pas modifié : la facturation réelle se change dans Stripe.
            {losesVoice ? " Passer en Essentiel libère le numéro Soline de l'artisan." : ""}
          </>
        }
        confirmLabel="Enregistrer"
        destructive={losesVoice}
        onConfirm={() => run(() => updateTenantPlanAction(profileId, { plan: nextPlan, status: nextStatus }), "Abonnement mis à jour")}
      >
        Enregistrer la correction
      </ConfirmButton>
    </div>
  );
}
