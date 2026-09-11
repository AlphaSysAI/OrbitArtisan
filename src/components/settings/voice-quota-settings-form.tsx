"use client";

import { useState, useTransition } from "react";
import { PhoneCall } from "lucide-react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { setVoiceAllowOverage } from "@/features/voice/actions";
import {
  formatVoiceQuotaMonthLabel,
  type VoiceQuotaSnapshot,
} from "@/lib/voice/voice-quota-types";

export type VoiceQuotaSettingsFormProps = {
  quota: VoiceQuotaSnapshot;
  allowOverage: boolean;
};

export function VoiceQuotaSettingsForm({ quota, allowOverage: initialAllowOverage }: VoiceQuotaSettingsFormProps) {
  const [allowOverage, setAllowOverage] = useState(initialAllowOverage);
  const [pending, startTransition] = useTransition();

  const monthLabel = formatVoiceQuotaMonthLabel(quota.periodStart);
  const hasVoicePlan = quota.voiceMinutesIncluded > 0;

  function handleSave() {
    startTransition(async () => {
      const result = await setVoiceAllowOverage(allowOverage);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Préférence de quota vocal enregistrée.");
    });
  }

  return (
    <div className="space-y-6 rounded-2xl border border-border/70 bg-muted/30 p-5">
      <div className="flex items-start gap-3">
        <PhoneCall className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="space-y-1">
          <h3 className="font-display text-lg font-semibold tracking-tight">Quota Soline ce mois-ci</h3>
          <p className="text-sm text-muted-foreground">
            Compteur remis à zéro le{" "}
            {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(quota.periodEnd))}.
            Les minutes non utilisées ne se reportent pas au mois suivant.
          </p>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Période</dt>
          <dd className="mt-1 font-semibold capitalize">{monthLabel}</dd>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Consommé</dt>
          <dd className="mt-1 font-semibold tabular-nums">
            {hasVoicePlan
              ? `${quota.voiceMinutesUsed} / ${quota.voiceMinutesIncluded} min`
              : `${quota.voiceMinutesUsed} min (hors forfait)`}
          </dd>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Restant</dt>
          <dd className="mt-1 font-semibold tabular-nums">
            {hasVoicePlan ? `${quota.remainingMinutes} min` : "—"}
          </dd>
        </div>
      </dl>

      {quota.voiceMinutesOverdue > 0 ? (
        <Alert>
          <p className="text-sm">
            <strong>{quota.voiceMinutesOverdue} minute{quota.voiceMinutesOverdue > 1 ? "s" : ""}</strong>{" "}
            consommée{quota.voiceMinutesOverdue > 1 ? "s" : ""} au-delà du forfait ce mois-ci
            {allowOverage ? " — refacturation sur votre prochaine facture d'abonnement." : "."}
          </p>
        </Alert>
      ) : null}

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-start gap-3">
          <input
            id="voice-allow-overage"
            type="checkbox"
            className="mt-1 size-4 rounded border-input"
            checked={allowOverage}
            disabled={pending}
            onChange={(event) => setAllowOverage(event.target.checked)}
          />
          <div className="space-y-2">
            <Label htmlFor="voice-allow-overage" className="cursor-pointer text-base font-medium leading-snug">
              Autoriser Soline à répondre au-delà de mon quota mensuel
            </Label>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {allowOverage ? (
                <>
                  Coché : Soline continue de répondre même une fois votre forfait épuisé. Les minutes
                  supplémentaires sont comptabilisées et refacturées sur votre prochaine facture
                  d&apos;abonnement, au tarif en vigueur.
                </>
              ) : (
                <>
                  Décoché : une fois votre quota mensuel consommé, Soline refuse les nouveaux appels
                  jusqu&apos;au début du mois suivant. Vos clients peuvent toujours vous joindre sur votre
                  ligne directe.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {!quota.canAcceptCalls ? (
        <Alert variant="destructive">
          <p className="text-sm">
            Votre quota est épuisé et vous avez désactivé le dépassement : Soline ne répond plus aux
            appels entrants pour le moment.
          </p>
        </Alert>
      ) : null}

      <Button type="button" disabled={pending} onClick={handleSave}>
        {pending ? "Enregistrement…" : "Enregistrer la préférence"}
      </Button>
    </div>
  );
}
