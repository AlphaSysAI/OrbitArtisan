"use client";

import { Bell, BellOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePushSubscription } from "@/lib/notifications/use-push-subscription";

export function PushNotificationsSettings() {
  const { supported, enabled, loading, busy, enable, disable } = usePushSubscription();

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Vérification des notifications…
      </div>
    );
  }

  if (!supported) {
    return (
      <p className="text-sm text-muted-foreground">
        Les notifications push ne sont pas disponibles sur ce navigateur ou appareil. Installez
        Soline sur l&apos;écran d&apos;accueil (PWA) pour une meilleure compatibilité.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p className="text-sm font-medium">Notifications sur le téléphone</p>
        <p className="text-sm text-muted-foreground">
          Messages, devis signés, nouvelles demandes et appels Soline — alertes même quand
          l&apos;application est fermée.
        </p>
        {enabled ? (
          <p className="text-xs text-muted-foreground">Abonnement actif sur cet appareil.</p>
        ) : null}
      </div>
      <Button
        type="button"
        variant={enabled ? "outline" : "default"}
        className="shrink-0 gap-2"
        disabled={busy}
        onClick={() => void (enabled ? disable() : enable())}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : enabled ? (
          <BellOff className="size-4" />
        ) : (
          <Bell className="size-4" />
        )}
        {enabled ? "Désactiver" : "Activer les notifications"}
      </Button>
    </div>
  );
}
