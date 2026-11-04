import type { SupabaseClient } from "@supabase/supabase-js";

export async function recentConversationMessages(db: SupabaseClient, conversationId: string, limit: number) {
  const { data } = await db.from("messages")
    .select("sender_user_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  return [...(data ?? [])].reverse();
}
