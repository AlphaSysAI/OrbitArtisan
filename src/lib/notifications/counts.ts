import type { SupabaseClient } from "@supabase/supabase-js";

import type { NotificationCounts } from "@/lib/notifications/types";

export type NotificationCountsResult = NotificationCounts | { ok: false; error: string };

/**
 * Compteurs de badges via la RPC `get_notification_counts` (security definer,
 * basée sur `auth.uid()` : renvoie `{ ok: false, error: "auth" }` sans session).
 * Pas de `auth.getUser()` préalable : PostgREST valide déjà le JWT, un
 * aller-retour Supabase Auth en moins par rafraîchissement de badges.
 */
export async function loadNotificationCounts(supabase: SupabaseClient): Promise<NotificationCountsResult> {
  const { data, error } = await supabase.rpc("get_notification_counts");
  if (error || !data || data.ok !== true) {
    return { ok: false, error: error?.message ?? (typeof data?.error === "string" ? data.error : "rpc_failed") };
  }

  return {
    ok: true,
    messages: Number(data.messages ?? 0),
    quotes_accepted: Number(data.quotes_accepted ?? 0),
    quotes_received: Number(data.quotes_received ?? 0),
    voice_intakes: Number(data.voice_intakes ?? 0),
    invoices_received: Number(data.invoices_received ?? 0),
    is_artisan: Boolean(data.is_artisan),
  };
}
