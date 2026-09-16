"use client";

import * as React from "react";
import { Bell, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePushSubscription } from "@/lib/notifications/use-push-subscription";

const DISMISS_KEY = "soline_push_banner_dismissed";

/**
 * Bandeau proactif tant que l'artisan n'a pas activé les notifications push.
 *
 * Point 11 de l'audit pré-pilote : l'activation était 100 % opt-in, cachée
 * dans Réglages, jamais proposée à l'onboarding. Affiché sur tout /app/**
 * (via AppShell) jusqu'à activation, refus explicite du navigateur, ou
 * "Plus tard" (masqué pour la session en cours seulement — reproposé à la
 * prochaine connexion tant que ce n'est pas activé).
 */
export function PushNotificationsBanner() {
  const { supported, enabled, permission, loading, busy, enable } = usePushSubscription();
  const [dismissed, setDismissed] = React.useState(true);

  React.useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // stockage indisponible (navigation privée, etc.) : pas bloquant.
    }
  };

  if (loading || !supported || enabled || permission === "denied" || dismissed) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Active les notifications</p>
          <p className="text-sm text-muted-foreground">
            Sois alerté immédiatement quand Soline reçoit un appel, qu&apos;un devis est signé ou
            qu&apos;un client écrit — même appli fermée.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        <Button type="button" variant="ghost" size="sm" onClick={dismiss} aria-label="Plus tard">
          <X className="size-4" />
          Plus tard
        </Button>
        <Button type="button" size="sm" className="gap-2" disabled={busy} onClick={() => void enable()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />}
          Activer
        </Button>
      </div>
    </div>
  );
}
