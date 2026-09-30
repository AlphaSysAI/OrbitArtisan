"use server";

import { revalidatePath } from "next/cache";

import { requireArtisanProfileId } from "@/lib/auth/require-artisan";
import { sendMessage } from "@/lib/messages/actions";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { normalizeCustomerPhone } from "@/lib/vitrine/customer-phone";

type Result = { ok: true; id?: string } | { ok: false; error: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;

function refresh(clientId?: string) {
  revalidatePath("/app/clients");
  if (clientId) revalidatePath(`/app/clients/${clientId}`);
  revalidatePath("/app");
}

async function ownClient(clientId: string) {
  const auth = await requireArtisanProfileId();
  if (!auth.ok || !UUID_RE.test(clientId)) return null;
  const { data: client } = await auth.supabase
    .from("clients")
    .select("id, artisan_id, display_name, email, phone, customer_user_id")
    .eq("id", clientId)
    .eq("artisan_id", auth.profileId)
    .maybeSingle();
  return client ? { ...auth, client } : null;
}

function readContact(formData: FormData) {
  const name = String(formData.get("display_name") ?? "").trim().replace(/\s+/g, " ");
  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const email = emailRaw ? (EMAIL_RE.test(emailRaw) ? emailRaw : undefined) : null;
  const phone = phoneRaw ? (normalizeCustomerPhone(phoneRaw) ?? undefined) : null;
  return {
    name,
    email,
    phone,
    address_line1: String(formData.get("address_line1") ?? "").trim() || null,
    postal_code: String(formData.get("postal_code") ?? "").trim() || null,
    city: String(formData.get("city") ?? "").trim() || null,
  };
}

/** Client ajouté à la main (appel direct, rencontre sur chantier…). */
export async function createClientManually(formData: FormData): Promise<Result> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false, error: "auth" };
  const c = readContact(formData);
  if (c.name.length < 2) return { ok: false, error: "invalid_name" };
  if (c.email === undefined) return { ok: false, error: "invalid_email" };
  if (c.phone === undefined) return { ok: false, error: "invalid_phone" };

  // Même client déjà connu (même e-mail ou téléphone) : on l'ouvre au lieu d'en créer un doublon.
  for (const [column, value] of [["email", c.email], ["phone", c.phone]] as const) {
    if (!value) continue;
    const { data: existing } = await auth.supabase
      .from("clients")
      .select("id")
      .eq("artisan_id", auth.profileId)
      .eq(column, value)
      .limit(1)
      .maybeSingle();
    if (existing?.id) return { ok: true, id: existing.id as string };
  }

  const { data, error } = await auth.supabase
    .from("clients")
    .insert({
      artisan_id: auth.profileId,
      display_name: c.name.slice(0, 200),
      email: c.email,
      phone: c.phone,
      address_line1: c.address_line1,
      postal_code: c.postal_code,
      city: c.city,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "insert_failed" };
  refresh();
  return { ok: true, id: data.id as string };
}

export async function updateClient(clientId: string, formData: FormData): Promise<Result> {
  const ctx = await ownClient(clientId);
  if (!ctx) return { ok: false, error: "not_found" };
  const c = readContact(formData);
  if (c.name.length < 2) return { ok: false, error: "invalid_name" };
  if (c.email === undefined) return { ok: false, error: "invalid_email" };
  if (c.phone === undefined) return { ok: false, error: "invalid_phone" };
  const { error } = await ctx.supabase
    .from("clients")
    .update({
      display_name: c.name.slice(0, 200),
      email: c.email,
      phone: c.phone,
      address_line1: c.address_line1,
      postal_code: c.postal_code,
      city: c.city,
    })
    .eq("id", clientId);
  if (error) return { ok: false, error: "update_failed" };
  refresh(clientId);
  return { ok: true };
}

/**
 * Message depuis la fiche : compte client → messagerie Soline (notification) ;
 * client sans compte → conversation « invité », la réponse part par e-mail.
 */
export async function sendClientMessage(clientId: string, body: string): Promise<Result> {
  const ctx = await ownClient(clientId);
  if (!ctx) return { ok: false, error: "not_found" };
  const text = body.trim();
  if (!text || text.length > 8000) return { ok: false, error: "invalid_body" };
  const { client, supabase, profileId } = ctx;

  let conversationId: string | null = null;
  if (client.customer_user_id) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("artisan_id", profileId)
      .eq("customer_user_id", client.customer_user_id)
      .maybeSingle();
    conversationId = (conv?.id as string | undefined) ?? null;
  } else {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("artisan_id", profileId)
      .eq("client_id", clientId)
      .is("customer_user_id", null)
      .is("lead_id", null)
      .maybeSingle();
    conversationId = (conv?.id as string | undefined) ?? null;
    if (!conversationId && !client.email) return { ok: false, error: "no_channel" };
  }

  if (!conversationId) {
    // Création réservée au service role : la RLS n'ouvre l'insertion qu'au client.
    const admin = createSupabaseServiceRoleClient();
    if (!admin) return { ok: false, error: "no_channel" };
    const { data: created } = await admin
      .from("conversations")
      .insert(
        client.customer_user_id
          ? { artisan_id: profileId, customer_user_id: client.customer_user_id, client_id: clientId }
          : { artisan_id: profileId, client_id: clientId },
      )
      .select("id")
      .single();
    conversationId = (created?.id as string | undefined) ?? null;
  }
  if (!conversationId) return { ok: false, error: "no_channel" };

  const res = await sendMessage(conversationId, text);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(clientId);
  return { ok: true };
}

/** Fusion de deux fiches (même personne enregistrée deux fois). */
export async function mergeClientsAction(keepId: string, removeId: string): Promise<Result> {
  const ctx = await ownClient(keepId);
  if (!ctx) return { ok: false, error: "not_found" };
  const { error } = await ctx.supabase.rpc("merge_clients", { p_keep: keepId, p_remove: removeId });
  if (error) {
    return { ok: false, error: /conflicting_accounts/.test(error.message) ? "conflicting_accounts" : "merge_failed" };
  }
  refresh(keepId);
  revalidatePath(`/app/clients/${removeId}`);
  return { ok: true };
}

/**
 * « Pas ce client ? » : déplace un élément (et ce qui en dépend) vers une nouvelle
 * fiche. Corrige un rattachement automatique erroné (numéro fixe partagé, etc.).
 */
export async function detachToNewClient(
  clientId: string,
  table: "quotes" | "voice_call_intakes" | "appointments",
  itemId: string,
  newName: string,
): Promise<Result> {
  const ctx = await ownClient(clientId);
  if (!ctx) return { ok: false, error: "not_found" };
  if (!["quotes", "voice_call_intakes", "appointments"].includes(table) || !UUID_RE.test(itemId)) {
    return { ok: false, error: "invalid_input" };
  }
  const name = newName.trim().replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, error: "invalid_name" };
  const { supabase, profileId } = ctx;

  const { data: item } = await supabase.from(table).select("id").eq("id", itemId).eq("client_id", clientId).maybeSingle();
  if (!item) return { ok: false, error: "not_found" };

  const { data: created } = await supabase
    .from("clients")
    .insert({ artisan_id: profileId, display_name: name.slice(0, 200) })
    .select("id")
    .single();
  if (!created) return { ok: false, error: "insert_failed" };
  const newId = created.id as string;

  await supabase.from(table).update({ client_id: newId }).eq("id", itemId);
  if (table === "quotes") {
    await supabase.from("invoices").update({ client_id: newId }).eq("quote_id", itemId);
    await supabase.from("projects").update({ client_id: newId }).eq("quote_id", itemId);
  }
  refresh(clientId);
  return { ok: true, id: newId };
}
