"use client";

import { useState, useTransition } from "react";
import { PhoneCall } from "lucide-react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setVoiceOverageCap } from "@/features/voice/actions";
import { formatCentsHtEur } from "@/lib/billing/subscription-plans";
import { formatVoiceQuotaMonthLabel, type VoiceQuotaSnapshot } from "@/lib/voice/voice-quota-types";

export type VoiceQuotaSettingsFormProps = {
  quota: VoiceQuotaSnapshot;
};

export function VoiceQuotaSettingsForm({ quota }: VoiceQuotaSettingsFormProps) {
  const [capEuros, setCapEuros] = useState(String(Math.round(quota.overageCapCents / 100)));
  const [pending, startTransition] = useTransition();

  const monthLabel = formatVoiceQuotaMonthLabel(quota.periodStart);
  const hasVoice = quota.callsIncluded > 0;
  const canOverage = hasVoice && !quota.isTrial && quota.overageCallCents > 0;
  const capNumber = Number(capEuros.replace(",", "."));
  const maxOverageCalls =
    canOverage && Number.isFinite(capNumber) ? Math.floor((capNumber * 100) / quota.overageCallCents) : 0;

  function handleSave() {
    startTransition(async () => {
      const result = await setVoiceOverageCap(Math.round(capNumber));
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Plafond de dépassement enregistré.");
    });
  }

  return (
    <div className="space-y-6 rounded-2xl border border-border/70 bg-muted/30 p-5">
      <div className="flex items-start gap-3">
        <PhoneCall className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="space-y-1">
          <h3 className="font-display text-lg font-semibold tracking-tight">
            {quota.isTrial ? "Appels Soline de l'essai" : "Appels Soline ce mois-ci"}
          </h3>
          <p className="text-sm text-muted-foreground">
            Un appel compte s&apos;il dure au moins 30 secondes.{" "}
            {quota.isTrial ? "Appels valables jusqu'à la fin de l'essai, le " : "Compteur remis à zéro le "}
            {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(quota.periodEnd))}
            {quota.isTrial ? "." : ", sans report des appels non utilisés."}
          </p>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Période</dt>
          <dd className="mt-1 font-semibold capitalize">{quota.isTrial ? "Essai" : monthLabel}</dd>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Appels</dt>
          <dd className="mt-1 font-semibold tabular-nums">
            {hasVoice ? `${quota.callsUsed} / ${quota.callsIncluded}` : "Non inclus"}
          </dd>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Hors forfait</dt>
          <dd className="mt-1 font-semibold tabular-nums">
            {quota.overageCalls > 0
              ? `${quota.overageCalls} appel${quota.overageCalls > 1 ? "s" : ""} · ${formatCentsHtEur(quota.overageAmountCents)} € HT`
              : "—"}
          </dd>
        </div>
      </dl>

      {quota.mode === "message_only" && hasVoice ? (
        <Alert variant="destructive">
          <p className="text-sm">
            {quota.isTrial
              ? "Vos appels d'essai sont utilisés : Soline décroche toujours mais prend seulement les messages. Abonnez-vous pour la réactiver entièrement."
              : "Forfait et plafond atteints : Soline décroche toujours mais prend seulement les messages (pas de devis ni de RDV) jusqu'à la fin du mois. Relevez le plafond pour la réactiver entièrement."}
          </p>
        </Alert>
      ) : null}

      {canOverage ? (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <Label htmlFor="voice-overage-cap" className="text-base font-medium">
            Plafond de dépassement mensuel
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="voice-overage-cap"
              inputMode="numeric"
              className="w-28 tabular-nums"
              value={capEuros}
              disabled={pending}
              onChange={(event) => setCapEuros(event.target.value.replace(/[^\d]/g, "").slice(0, 4))}
            />
            <span className="text-sm text-muted-foreground">€ HT / mois</span>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Au-delà de vos {quota.callsIncluded} appels inclus, chaque appel est facturé{" "}
            {formatCentsHtEur(quota.overageCallCents)} € HT, facturé début du mois suivant
            {maxOverageCalls > 0
              ? `, soit jusqu'à ${maxOverageCalls} appel${maxOverageCalls > 1 ? "s" : ""} supplémentaire${maxOverageCalls > 1 ? "s" : ""} avec ce plafond`
              : ""}
            . Une fois le plafond atteint, Soline ne coupe jamais la ligne : elle prend seulement les messages.
            Mettez 0 pour ne jamais payer de dépassement.
          </p>
          <Button type="button" disabled={pending || !Number.isFinite(capNumber)} onClick={handleSave}>
            {pending ? "Enregistrement…" : "Enregistrer le plafond"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
