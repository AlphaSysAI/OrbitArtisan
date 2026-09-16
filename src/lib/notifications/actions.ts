"use server";

import { revalidatePath } from "next/cache";

import type { NotificationCategory, NotificationCounts } from "@/lib/notifications/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function fetchNotificationCounts(): Promise<
  NotificationCounts | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };

  const { data, error } = await supabase.rpc("get_notification_counts");
  if (error || !data || data.ok !== true) {
    return { ok: false, error: error?.message ?? "rpc_failed" };
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

export async function markConversationRead(conversationId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_conversation_read", {
    p_conversation_id: conversationId,
  });
  if (error) return { ok: false as const, error: "rpc" as const };

  revalidatePath("/app/messages");
  revalidatePath("/compte/messages");
  return { ok: true as const };
}

export async function markNotificationCategorySeen(category: NotificationCategory) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_notification_category_seen", {
    p_category: category,
  });
  if (error) return { ok: false as const, error: "rpc" as const };

  revalidatePath("/app");
  revalidatePath("/compte");
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
