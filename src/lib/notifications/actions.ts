"use server";

import type { NotificationCategory } from "@/lib/notifications/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function markConversationRead(conversationId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_conversation_read", {
    p_conversation_id: conversationId,
  });
  if (error) return { ok: false as const, error: "rpc" as const };

  // Pas de revalidatePath (perf, point 10) : appelée à chaque nouveau message
  // du fil ouvert, elle forçait le re-rendu serveur de la page courante et
  // vidait le cache de navigation. Les listes de conversations sont
  // dynamiques (relues à chaque navigation) et le badge est rafraîchi par
  // l'appelant via le NotificationProvider.
  return { ok: true as const };
}

export async function markNotificationCategorySeen(category: NotificationCategory) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_notification_category_seen", {
    p_category: category,
  });
  if (error) return { ok: false as const, error: "rpc" as const };

  // Pas de revalidatePath ici (perf, point 4) : dans une server action, il
  // forçait le re-rendu complet de la page courante et vidait le cache de
  // navigation client à chaque visite de /app/quotes, /mes-devis,
  // /compte/factures. Les pages concernées sont dynamiques et relisent le
  // watermark à chaque navigation.
  return { ok: true as const };
}

export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "auth" as const };

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.userAgent ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) return { ok: false as const, error: "insert_failed" as const };
  return { ok: true as const };
}

export async function removePushSubscription(endpoint: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "auth" as const };

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  if (error) return { ok: false as const, error: "delete_failed" as const };
  return { ok: true as const };
}
