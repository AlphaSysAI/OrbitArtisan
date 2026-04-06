"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function ensureCustomerProfile(displayName?: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "auth" as const };

  const { data: existing } = await supabase
    .from("customer_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return { ok: true as const };

  const name =
    displayName?.trim() ||
    user.email?.split("@")[0] ||
    "Client";

  const { error } = await supabase.from("customer_profiles").insert({
    user_id: user.id,
    display_name: name,
    email: user.email ?? null,
  });
  if (error) return { ok: false as const, error: "insert_failed" as const };
  return { ok: true as const };
}

export async function getOrCreateConversation(artisanId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "auth" as const };

  const { data: own } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (own?.id === artisanId) {
    return { ok: false as const, error: "own_page" as const };
  }

  const ensure = await ensureCustomerProfile();
  if (!ensure.ok) return ensure;

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("artisan_id", artisanId)
    .eq("customer_user_id", user.id)
    .maybeSingle();

  if (existing?.id) return { ok: true as const, conversationId: existing.id };

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ artisan_id: artisanId, customer_user_id: user.id })
    .select("id")
    .single();

  if (error || !created) return { ok: false as const, error: "create_failed" as const };
  return { ok: true as const, conversationId: created.id };
}

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
};

export async function listMessages(conversationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_user_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) return { ok: false as const, error: "fetch_failed" as const, messages: [] as MessageRow[] };
  return { ok: true as const, messages: (data ?? []) as MessageRow[] };
}

export async function sendMessage(conversationId: string, body: string, vitrineSlug?: string) {
  const text = body.trim();
  if (!text || text.length > 8000) return { ok: false as const, error: "invalid_body" as const };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "auth" as const };

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_user_id: user.id,
    body: text,
  });

  if (error) return { ok: false as const, error: "insert_failed" as const };

  revalidatePath("/app/messages");
  revalidatePath("/compte/messages");
  if (vitrineSlug) revalidatePath(`/site/${vitrineSlug}`);
  return { ok: true as const };
}

export async function listConversationsForArtisan() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "auth" as const, items: [] };

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return { ok: true as const, items: [] };

  const { data: convs } = await supabase
    .from("conversations")
    .select("id, updated_at, customer_user_id")
    .eq("artisan_id", profile.id)
    .order("updated_at", { ascending: false });

  const items = await Promise.all(
    (convs ?? []).map(async (c) => {
      const { data: cp } = await supabase
        .from("customer_profiles")
        .select("display_name")
        .eq("user_id", c.customer_user_id)
        .maybeSingle();
      return {
        id: c.id,
        updated_at: c.updated_at,
        customer_label: cp?.display_name ?? "Client",
      };
    }),
  );

  return { ok: true as const, items };
}

export type CustomerConversationItem = {
  id: string;
  updated_at: string;
  artisan_label: string;
};

export async function listConversationsForCustomer() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "auth" as const, items: [] as CustomerConversationItem[] };

  const { data: convs } = await supabase
    .from("conversations")
    .select("id, updated_at, artisan_id")
    .eq("customer_user_id", user.id)
    .order("updated_at", { ascending: false });

  const items: CustomerConversationItem[] = await Promise.all(
    (convs ?? []).map(async (c) => {
      const { data: artisan } = await supabase
        .from("profiles")
        .select("business_name")
        .eq("id", c.artisan_id)
        .maybeSingle();
      return {
        id: c.id,
        updated_at: c.updated_at,
        artisan_label: artisan?.business_name ?? "Artisan",
      };
    }),
  );

  return { ok: true as const, items };
}
