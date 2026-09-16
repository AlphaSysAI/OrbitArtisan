"use client";

import * as React from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { removePushSubscription, savePushSubscription } from "@/lib/notifications/actions";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushNotificationsSettings() {
  const [supported, setSupported] = React.useState(false);
  const [enabled, setEnabled] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window &&
      !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
    setSupported(ok);
    if (!ok) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setEnabled(!!sub && Notification.permission === "granted");
      } catch {
        setEnabled(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const enable = async () => {
    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
    if (!vapidPublic) {
      toast.error("Notifications push non configurées sur ce serveur.");
      return;
    }

    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.message("Autorisez les notifications dans les réglages de votre navigateur.");
        setEnabled(false);
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublic),
        });
      }

      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        toast.error("Abonnement push invalide.");
        return;
      }

      const saved = await savePushSubscription({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent,
      });

      if (!saved.ok) {
        toast.error("Impossible d'enregistrer l'abonnement push.");
        return;
      }

      setEnabled(true);
      toast.success("Notifications activées sur cet appareil.");
    } catch {
      toast.error("Activation des notifications impossible sur cet appareil.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setEnabled(false);
      toast.success("Notifications désactivées.");
    } catch {
      toast.error("Impossible de désactiver les notifications.");
    } finally {
      setBusy(false);
    }
  };

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
