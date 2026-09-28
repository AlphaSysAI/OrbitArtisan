"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { resendAccountantConfirmation, saveAccountingSettings } from "./actions";

export function AccountingSettingsForm({
  initialEmail,
  initialEnabled,
  confirmed,
}: {
  initialEmail: string;
  initialEnabled: boolean;
  /** Le comptable a accepté les envois depuis le lien reçu. */
  confirmed: boolean;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  function onSave() {
    startTransition(async () => {
      const res = await saveAccountingSettings({ accountantEmail: email, enabled });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.confirmationSent
          ? "Enregistré. Votre comptable a reçu un e-mail pour accepter les envois."
          : enabled
            ? "Envoi comptable activé."
            : "Réglages enregistrés.",
      );
    });
  }

  function onResend() {
    startTransition(async () => {
      const res = await resendAccountantConfirmation();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Lien de confirmation renvoyé à votre comptable.");
    });
  }

  const savedEmail = initialEmail.trim();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="accountant-email">E-mail de votre comptable</Label>
        <Input
          id="accountant-email"
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="cabinet@exemple.fr"
          value={email}
          disabled={pending}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      {savedEmail && email.trim().toLowerCase() === savedEmail.toLowerCase() ? (
        confirmed ? (
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            ✓ Votre comptable a accepté les envois.
          </p>
        ) : (
          <div className="space-y-2 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <p>
              En attente de confirmation : votre comptable a reçu un e-mail pour accepter les envois. Tant
              qu&apos;il n&apos;a pas accepté, rien ne lui est envoyé.
            </p>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onResend}>
              Renvoyer le lien
            </Button>
          </div>
        )
      ) : null}
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 rounded border-input"
          checked={enabled}
          disabled={pending}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <span className="text-sm leading-snug">
          Envoyer automatiquement mes factures du mois à mon comptable, le dernier jour du mois (préavis 48 h
          avant). Vous êtes en copie de chaque envoi, et votre comptable vous répond directement.
        </span>
      </label>
      <Button type="button" disabled={pending} onClick={onSave}>
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </div>
  );
}
