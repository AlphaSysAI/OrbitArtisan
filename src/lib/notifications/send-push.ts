import "server-only";

import webpush from "web-push";

import type { PushPayload } from "@/lib/notifications/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() ?? "mailto:contact@solinebtp.fr";

  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

/** Envoie une notification push à un utilisateur (fire-and-forget côté appelant). */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!ensureVapid()) return;

  const admin = createSupabaseServiceRoleClient();
  if (!admin) return;

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs?.length) return;

  const body = JSON.stringify(payload);
  const staleIds: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint as string,
            keys: {
              p256dh: sub.p256dh as string,
              auth: sub.auth as string,
            },
          },
          body,
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          staleIds.push(sub.id as string);
        }
      }
    }),
  );

  if (staleIds.length) {
    await admin.from("push_subscriptions").delete().in("id", staleIds);
  }
}

export function notifyUserActivity(userId: string, payload: PushPayload) {
  void sendPushToUser(userId, payload);
}
