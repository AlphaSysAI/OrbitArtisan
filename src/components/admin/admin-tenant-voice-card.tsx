"use client";

import { useState, useTransition } from "react";

import { assignTenantVoiceFromPool, updateTenantVoiceNumber } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AdminTenantVoiceCard({
  profileId,
  currentPhoneE164,
}: {
  profileId: string;
  currentPhoneE164: string | null;
}) {
  const [pending, startTransition] = useTransition();

  const [message, setMessage] = useState<string | null>(null);

  const assignFromPool = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await assignTenantVoiceFromPool(profileId);
      if (result.ok) {
        window.location.reload();
      } else {
        setMessage(voiceAssignErrorMessage(result.error));
      }
    });
  };

  const saveManual = (formData: FormData) => {
    setMessage(null);
    startTransition(async () => {
      const result = await updateTenantVoiceNumber(profileId, formData);
      if (result.ok) {
        window.location.reload();
      } else {
        setMessage(voiceAssignErrorMessage(result.error));
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Numéro Soline</CardTitle>
        <CardDescription>
          Attribution manuelle ou depuis le pool (réservé Super Admin).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={saveManual} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="voice_phone_e164">E.164</Label>
            <Input
              id="voice_phone_e164"
              name="voice_phone_e164"
              defaultValue={currentPhoneE164 ?? ""}
              placeholder="+339XXXXXXXX"
              className="font-mono"
              disabled={pending}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              Enregistrer le numéro
            </Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={assignFromPool}>
              Attribuer depuis le pool
            </Button>
          </div>
          {message ? <p className="text-sm text-destructive">{message}</p> : null}
          <p className="text-xs text-muted-foreground">
            Laissez le champ vide et enregistrez pour retirer le rattachement vocal.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

function voiceAssignErrorMessage(error: string): string {
  switch (error) {
    case "plan_without_voice":
      return "Ce compte est en formule Base : passez-le en Pro ou Premium (bloc Abonnement) — le numéro sera attribué automatiquement.";
    case "subscription_inactive":
      return "Abonnement résilié : réactivez-le (statut actif ou essai) avant d'attribuer un numéro.";
    case "pool_empty":
      return "Aucun numéro disponible ET marqué « ElevenLabs prêt » dans Télécom → Pool.";
    case "invalid_phone":
      return "Numéro invalide : format E.164, ex. +339XXXXXXXX.";
    case "not_found":
      return "Compte introuvable.";
    default:
      return error;
  }
}
