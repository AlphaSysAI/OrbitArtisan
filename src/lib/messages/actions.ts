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

/**
 * Lecture seule : retourne la conversation existante, sans jamais en créer.
 * Consulter une vitrine ne doit pas inscrire le visiteur chez l'artisan —
 * la création est réservée à un acte explicite (premier message, prise de RDV).
 */
export async function findConversation(artisanId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "auth" as const };

  const { data: own } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (own?.id === artisanId) return { ok: false as const, error: "own_page" as const };

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("artisan_id", artisanId)
    .eq("customer_user_id", user.id)
    .maybeSingle();

  return { ok: true as const, conversationId: existing?.id ?? null };
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

export type MessageAttachmentRow = {
  id: string;
  storage_bucket: string;
  storage_path: string;
  kind: string;
  file_name: string | null;
  signed_url?: string | null;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_user_id: string | null;
  kind: string;
  body: string;
  created_at: string;
  attachments?: MessageAttachmentRow[];
};

export async function listMessages(conversationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_user_id, kind, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) return { ok: false as const, error: "fetch_failed" as const, messages: [] as MessageRow[] };

  const messages = (data ?? []) as MessageRow[];
  const messageIds = messages.map((m) => m.id);
  if (!messageIds.length) return { ok: true as const, messages };

  const { data: attachments } = await supabase
    .from("message_attachments")
    .select("id, message_id, storage_bucket, storage_path, kind, file_name")
    .in("message_id", messageIds);

  const byMessage = new Map<string, MessageAttachmentRow[]>();
  for (const row of attachments ?? []) {
    const list = byMessage.get(row.message_id as string) ?? [];
    list.push({
      id: row.id as string,
      storage_bucket: row.storage_bucket as string,
      storage_path: row.storage_path as string,
      kind: row.kind as string,
      file_name: (row.file_name as string | null) ?? null,
    });
    byMessage.set(row.message_id as string, list);
  }

  for (const message of messages) {
    const rows = byMessage.get(message.id) ?? [];
    if (!rows.length) continue;
    message.attachments = await Promise.all(
      rows.map(async (att) => {
        const { data: signed } = await supabase.storage
          .from(att.storage_bucket)
          .createSignedUrl(att.storage_path, 3600);
        return { ...att, signed_url: signed?.signedUrl ?? null };
      }),
    );
  }

  return { ok: true as const, messages };
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
    .select("id, updated_at, customer_user_id, lead_id")
    .eq("artisan_id", profile.id)
    .order("updated_at", { ascending: false });

  const items = await Promise.all(
    (convs ?? []).map(async (c) => {
      if (c.lead_id) {
        const { data: lead } = await supabase
          .from("leads")
          .select("contact_name")
          .eq("id", c.lead_id)
          .maybeSingle();
        return {
          id: c.id,
          updated_at: c.updated_at,
          customer_label: lead?.contact_name?.trim() || "Demande Orbit",
          is_lead: true,
        };
      }

      const { data: cp } = await supabase
        .from("customer_profiles")
        .select("display_name")
        .eq("user_id", c.customer_user_id)
        .maybeSingle();
      return {
        id: c.id,
        updated_at: c.updated_at,
        customer_label: cp?.display_name ?? "Client",
        is_lead: false,
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
