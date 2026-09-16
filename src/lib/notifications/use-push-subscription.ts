"use client";

import * as React from "react";
import { toast } from "sonner";

import { removePushSubscription, savePushSubscription } from "@/lib/notifications/actions";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * État et actions d'abonnement aux notifications push, partagés entre le
 * réglage explicite (page Réglages) et le bandeau proactif affiché tant que
 * l'artisan n'a pas activé les notifications (voir PushNotificationsBanner).
 */
export function usePushSubscription() {
  const [supported, setSupported] = React.useState(false);
  const [enabled, setEnabled] = React.useState(false);
  const [permission, setPermission] = React.useState<NotificationPermission | "unsupported">("unsupported");
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const checkStatus = React.useCallback(async () => {
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

    setPermission(Notification.permission);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setEnabled(!!sub && Notification.permission === "granted");
    } catch {
      setEnabled(false);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  const enable = React.useCallback(async () => {
    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
    if (!vapidPublic) {
      toast.error("Notifications push non configurées sur ce serveur.");
      return;
    }

    setBusy(true);
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") {
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
  }, []);

  const disable = React.useCallback(async () => {
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
  }, []);

  return { supported, enabled, permission, loading, busy, enable, disable };
}
