"use client";

import { useTransition } from "react";

import {
  assignTenantVoiceFromPool,
  updateTenantVoiceNumberForm,
} from "@/app/admin/actions";
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

  const assignFromPool = () => {
    startTransition(async () => {
      const result = await assignTenantVoiceFromPool(profileId);
      if (result.ok) {
        window.location.reload();
      } else {
        const msg =
          result.error === "pool_empty"
            ? "Pool vocal vide — ajoutez des numéros dans Télécom → Pool."
            : result.error;
        window.alert(msg);
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
        <form action={updateTenantVoiceNumberForm.bind(null, profileId)} className="space-y-3">
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
          <p className="text-xs text-muted-foreground">
            Laissez le champ vide et enregistrez pour retirer le rattachement vocal.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
