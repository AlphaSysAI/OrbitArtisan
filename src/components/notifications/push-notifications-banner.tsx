"use client";

import * as React from "react";
import { Bell, BellOff, Loader2, Share, X } from "lucide-react";

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

  if (loading || enabled || dismissed) return null;

  // iPhone/iPad : les notifications web n'existent que dans l'app installée sur
  // l'écran d'accueil (iOS 16.4+). Dans Safari, on explique comment l'installer.
  if (!supported && isIosBrowserTab()) {
    return (
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Share className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Recevoir les alertes d&apos;appels urgents sur iPhone</p>
            <p className="text-sm text-muted-foreground">
              Touche <strong>Partager</strong> puis <strong>Sur l&apos;écran d&apos;accueil</strong>, ouvre Soline
              depuis l&apos;icône, puis active les notifications.
            </p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" className="self-end sm:self-auto" onClick={dismiss}>
          <X className="size-4" />
          Plus tard
        </Button>
      </div>
    );
  }

  if (!supported) return null;

  if (permission === "denied") {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
        <BellOff className="mt-0.5 size-5 shrink-0 text-amber-700" />
        <div className="flex-1 space-y-0.5">
          <p className="text-sm font-medium">Notifications bloquées</p>
          <p className="text-sm text-muted-foreground">
            Tu ne seras pas prévenu des appels urgents. Réautorise Soline dans les réglages de notifications de ton
            téléphone (ou du navigateur), puis recharge la page.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={dismiss} aria-label="Masquer">
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Active les notifications</p>
          <p className="text-sm text-muted-foreground">
            Sois alerté immédiatement d&apos;un appel urgent (fuite, gaz, panne…), d&apos;un devis signé ou
            d&apos;un message client — même appli fermée.
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

function isIosBrowserTab(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}
