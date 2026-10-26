"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { assignTenantVoiceFromPool, updateTenantVoiceNumber } from "@/app/admin/actions";
import { ConfirmButton } from "@/components/admin/ui/confirm-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPhoneFr } from "@/lib/phone";

function voiceAssignErrorMessage(error: string): string {
  switch (error) {
    case "plan_without_voice":
      return "Formule Essentiel : passer le compte en Pro ou Premium pour lui attribuer un numéro.";
    case "subscription_inactive":
      return "Abonnement inactif : un numéro ne s'attribue qu'en essai ou abonné.";
    case "provisioning_started":
      return "Aucun numéro libre : achat Twilio lancé. Actualiser dans quelques secondes (e-mail d'alerte en cas d'échec).";
    case "pool_empty":
      return "Aucun numéro prêt dans le stock (disponible et importé dans ElevenLabs).";
    case "invalid_phone":
      return "Numéro invalide : format +339XXXXXXXX.";
    default:
      return error;
  }
}

export function AdminTenantVoiceCard({ profileId, currentPhoneE164 }: { profileId: string; currentPhoneE164: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(currentPhoneE164 ?? "");

  const save = async (phone: string) => {
    const fd = new FormData();
    fd.set("voice_phone_e164", phone);
    const res = await updateTenantVoiceNumber(profileId, fd);
    if (!res.ok) {
      toast.error(voiceAssignErrorMessage(res.error));
      return false;
    }
    toast.success(phone ? "Numéro enregistré" : "Numéro retiré");
    router.refresh();
    return true;
  };

  return (
    <div className="space-y-4">
      <p className="text-sm">
        {currentPhoneE164 ? (
          <>
            Numéro actuel : <span className="font-mono font-medium">{formatPhoneFr(currentPhoneE164)}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Aucun numéro Soline rattaché.</span>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await assignTenantVoiceFromPool(profileId);
              if (!res.ok) return void toast.error(voiceAssignErrorMessage(res.error));
              toast.success("Numéro attribué depuis le stock");
              router.refresh();
            })
          }
        >
          Attribuer depuis le stock
        </Button>
        {currentPhoneE164 ? (
          <ConfirmButton
            destructive
            variant="ghost"
            title="Retirer le numéro Soline ?"
            description="Les appels vers ce numéro ne seront plus rattachés à cet artisan. Le numéro passe en quarantaine."
            confirmLabel="Retirer"
            onConfirm={() => save("")}
          >
            Retirer le numéro
          </ConfirmButton>
        ) : null}
      </div>
      <form
        className="space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!value.trim()) return;
          start(async () => void (await save(value.trim())));
        }}
      >
        <Label htmlFor="voice_phone_e164">Rattacher un numéro précis</Label>
        <div className="flex gap-2">
          <Input
            id="voice_phone_e164"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="+339XXXXXXXX"
            className="font-mono"
            disabled={pending}
          />
          <Button type="submit" size="sm" variant="outline" className="h-10" disabled={pending || !value.trim() || value.trim() === currentPhoneE164}>
            Rattacher
          </Button>
        </div>
      </form>
    </div>
  );
}
