"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveAccountingSettings } from "./actions";

export function AccountingSettingsForm({
  initialEmail,
  initialEnabled,
}: {
  initialEmail: string;
  initialEnabled: boolean;
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
      toast.success(enabled ? "Envoi comptable activé." : "Réglages enregistrés.");
    });
  }

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
