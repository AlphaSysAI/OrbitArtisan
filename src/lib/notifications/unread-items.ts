import type { NotificationCategory } from "@/lib/notifications/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchNotificationWatermark(
  supabase: SupabaseClient,
  userId: string,
  category: NotificationCategory,
): Promise<Date | null> {
  const { data } = await supabase
    .from("user_notification_watermarks")
    .select("last_seen_at")
    .eq("user_id", userId)
    .eq("category", category)
    .maybeSingle();

  return data?.last_seen_at ? new Date(data.last_seen_at) : null;
}

export async function getUnreadConversationIds(
  supabase: SupabaseClient,
  userId: string,
  conversationIds: string[],
  artisanProfileId: string | null,
): Promise<Set<string>> {
  if (!conversationIds.length) return new Set();

  const { data: reads } = await supabase
    .from("conversation_reads")
    .select("conversation_id, last_read_at")
    .eq("user_id", userId)
    .in("conversation_id", conversationIds);

  const readAt = new Map(
    (reads ?? []).map((row) => [row.conversation_id as string, row.last_read_at as string | null]),
  );

  const unread = new Set<string>();

  await Promise.all(
    conversationIds.map(async (conversationId) => {
      const since = readAt.get(conversationId) ?? "1970-01-01T00:00:00.000Z";
      let query = supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .gt("created_at", since);

      if (artisanProfileId) {
        query = query.or(`sender_user_id.neq.${userId},and(sender_user_id.is.null,kind.eq.lead_recap)`);
      } else {
        query = query.neq("sender_user_id", userId);
      }

      const { count } = await query;
      if ((count ?? 0) > 0) unread.add(conversationId);
    }),
  );

  return unread;
}

export function isQuoteUnreadForArtisan(
  quote: { status: string; signed_at: string | null },
  watermark: Date | null,
): boolean {
  if (quote.status !== "accepted" || !quote.signed_at) return false;
  return new Date(quote.signed_at) > (watermark ?? new Date(0));
}

export function isQuoteUnreadForCustomer(
  quote: { status: string; sent_at: string | null; updated_at: string },
  watermark: Date | null,
): boolean {
  if (quote.status !== "sent") return false;
  const ref = new Date(quote.sent_at ?? quote.updated_at);
  return ref > (watermark ?? new Date(0));
}
