"use server";

import { revalidatePath } from "next/cache";

import { formatContactDisplayName } from "@/lib/contacts/display-name";
import { getPublicSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PendingInvitationItem = {
  kind: "pending";
  id: string;
  email: string;
  invitedName: string | null;
  createdAt: string;
  inviteUrl: string;
  accountType: "client" | "artisan";
};

export type LinkedContactItem = {
  kind: "linked";
  customerUserId: string;
  label: string;
  email: string | null;
  conversationId: string | null;
  lastActivityAt: string;
};

export type ArtisanContactItem = PendingInvitationItem | LinkedContactItem;

export async function listArtisanContacts(): Promise<{ ok: true; items: ArtisanContactItem[] } | { ok: false; error: string; items: [] }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth", items: [] };

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return { ok: true, items: [] };

  const siteUrl = getPublicSiteUrl();

  const { data: pending } = await supabase
    .from("platform_invitations")
    .select("id, email, invited_name, created_at, token, account_type")
    .eq("inviter_user_id", user.id)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  const pendingItems: PendingInvitationItem[] = (pending ?? []).map((row) => ({
    kind: "pending",
    id: row.id,
    email: row.email,
    invitedName: row.invited_name,
    createdAt: row.created_at,
    inviteUrl: `${siteUrl}/invitation/${row.token}`,
    accountType: row.account_type as "client" | "artisan",
  }));

  const { data: convs } = await supabase
    .from("conversations")
    .select("id, customer_user_id, updated_at")
    .eq("artisan_id", profile.id)
    .order("updated_at", { ascending: false });

  const linkedByUser = new Map<string, LinkedContactItem>();

  for (const c of convs ?? []) {
    const { data: cp } = await supabase
      .from("customer_profiles")
      .select("display_name, email")
      .eq("user_id", c.customer_user_id)
      .maybeSingle();

    linkedByUser.set(c.customer_user_id, {
      kind: "linked",
      customerUserId: c.customer_user_id,
      label: formatContactDisplayName({
        profileName: cp?.display_name,
        email: cp?.email,
      }),
      email: cp?.email ?? null,
      conversationId: c.id,
      lastActivityAt: c.updated_at,
    });
  }

  const { data: acceptedInvites } = await supabase
    .from("platform_invitations")
    .select("accepted_user_id, accepted_at")
    .eq("artisan_id", profile.id)
    .eq("account_type", "client")
    .eq("status", "accepted")
    .not("accepted_user_id", "is", null);

  for (const inv of acceptedInvites ?? []) {
    const uid = inv.accepted_user_id as string;
    if (linkedByUser.has(uid)) continue;

    const { data: cp } = await supabase
      .from("customer_profiles")
      .select("display_name, email")
      .eq("user_id", uid)
      .maybeSingle();

    linkedByUser.set(uid, {
      kind: "linked",
      customerUserId: uid,
      label: formatContactDisplayName({
        profileName: cp?.display_name,
        email: cp?.email,
      }),
      email: cp?.email ?? null,
      conversationId: null,
      lastActivityAt: inv.accepted_at ?? new Date().toISOString(),
    });
  }

  const linkedItems = [...linkedByUser.values()].sort(
    (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
  );

  return { ok: true, items: [...pendingItems, ...linkedItems] };
}

export type CustomerContactItem = {
  artisanId: string;
  artisanLabel: string;
  slug: string;
  conversationId: string | null;
  lastActivityAt: string;
};

export async function listCustomerContacts(): Promise<
  { ok: true; items: CustomerContactItem[] } | { ok: false; error: string; items: [] }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth", items: [] };

  const { data: convs } = await supabase
    .from("conversations")
    .select("id, artisan_id, updated_at")
    .eq("customer_user_id", user.id)
    .order("updated_at", { ascending: false });

  const byArtisan = new Map<string, CustomerContactItem>();

  for (const c of convs ?? []) {
    const { data: artisan } = await supabase
      .from("profiles")
      .select("id, business_name, slug")
      .eq("id", c.artisan_id)
      .maybeSingle();
    if (!artisan?.slug) continue;

    byArtisan.set(artisan.id, {
      artisanId: artisan.id,
      artisanLabel: artisan.business_name,
      slug: artisan.slug,
      conversationId: c.id,
      lastActivityAt: c.updated_at,
    });
  }

  const { data: accepted } = await supabase
    .from("platform_invitations")
    .select("artisan_id, accepted_at")
    .eq("accepted_user_id", user.id)
    .eq("account_type", "client")
    .eq("status", "accepted")
    .not("artisan_id", "is", null);

  for (const inv of accepted ?? []) {
    if (byArtisan.has(inv.artisan_id)) continue;
    const { data: artisan } = await supabase
      .from("profiles")
      .select("id, business_name, slug")
      .eq("id", inv.artisan_id)
      .maybeSingle();
    if (!artisan?.slug) continue;

    byArtisan.set(artisan.id, {
      artisanId: artisan.id,
      artisanLabel: artisan.business_name,
      slug: artisan.slug,
      conversationId: null,
      lastActivityAt: inv.accepted_at ?? new Date().toISOString(),
    });
  }

  const items = [...byArtisan.values()].sort(
    (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
  );

  return { ok: true, items };
}

export async function artisanCanViewCustomer(customerUserId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return false;

  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("artisan_id", profile.id)
    .eq("customer_user_id", customerUserId)
    .maybeSingle();
  if (conv) return true;

  const { data: invite } = await supabase
    .from("platform_invitations")
    .select("id")
    .eq("artisan_id", profile.id)
    .eq("accepted_user_id", customerUserId)
    .eq("account_type", "client")
    .eq("status", "accepted")
    .maybeSingle();
  if (invite) return true;

  const { data: quote } = await supabase
    .from("quotes")
    .select("id")
    .eq("artisan_id", profile.id)
    .eq("customer_user_id", customerUserId)
    .limit(1)
    .maybeSingle();

  return !!quote;
}

export async function getOrCreateArtisanCustomerConversation(customerUserId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "auth" as const };

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return { ok: false as const, error: "missing_profile" as const };

  const allowed = await artisanCanViewCustomer(customerUserId);
  if (!allowed) return { ok: false as const, error: "forbidden" as const };

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("artisan_id", profile.id)
    .eq("customer_user_id", customerUserId)
    .maybeSingle();

  if (existing?.id) return { ok: true as const, conversationId: existing.id };

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ artisan_id: profile.id, customer_user_id: customerUserId })
    .select("id")
    .single();

  if (error || !created) return { ok: false as const, error: "create_failed" as const };

  revalidatePath("/app/messages");
  revalidatePath("/app/contacts");
  return { ok: true as const, conversationId: created.id };
}

export type CustomerDeletionCounts = {
  messages: number;
  appointments: number;
  upcomingAppointments: number;
};

export type DeleteCustomerResult =
  | { ok: true }
  | {
      ok: false;
      error: "auth" | "missing_profile" | "forbidden" | "has_quotes" | "has_invoices" | "rls_blocked" | "delete_failed";
    };

/**
 * Compte ce qu'une suppression détruirait, pour l'afficher avant confirmation.
 * Ne modifie rien.
 */
export async function getCustomerDeletionCounts(customerUserId: string): Promise<CustomerDeletionCounts> {
  const empty = { messages: 0, appointments: 0, upcomingAppointments: 0 };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return empty;

  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("artisan_id", profile.id)
    .eq("customer_user_id", customerUserId)
    .maybeSingle();

  let messages = 0;
  if (conv?.id) {
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conv.id);
    messages = count ?? 0;
  }

  const { count: appointments } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("artisan_id", profile.id)
    .eq("customer_user_id", customerUserId);

  const { count: upcoming } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("artisan_id", profile.id)
    .eq("customer_user_id", customerUserId)
    .gte("start_time", new Date().toISOString());

  return {
    messages,
    appointments: appointments ?? 0,
    upcomingAppointments: upcoming ?? 0,
  };
}

/**
 * Détache un client de l'artisan : conversation (messages en cascade), rendez-vous
 * et invitation acceptée. Le compte du client n'est pas touché — il peut rester
 * client d'un autre artisan.
 *
 * Refusé si un devis ou une facture existe : ces pièces sont comptables et doivent
 * conserver leur rattachement.
 */
export async function deleteArtisanCustomerLink(customerUserId: string): Promise<DeleteCustomerResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return { ok: false, error: "missing_profile" };

  const allowed = await artisanCanViewCustomer(customerUserId);
  if (!allowed) return { ok: false, error: "forbidden" };

  // Garde-fous revalidés côté serveur : l'état de l'interface n'est jamais une autorisation.
  const { count: quotesCount } = await supabase
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .eq("artisan_id", profile.id)
    .eq("customer_user_id", customerUserId);
  if ((quotesCount ?? 0) > 0) return { ok: false, error: "has_quotes" };

  const { count: invoicesCount } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("artisan_id", profile.id)
    .eq("customer_user_id", customerUserId);
  if ((invoicesCount ?? 0) > 0) return { ok: false, error: "has_invoices" };

  const { data: convBefore } = await supabase
    .from("conversations")
    .select("id")
    .eq("artisan_id", profile.id)
    .eq("customer_user_id", customerUserId);

  const { data: convDeleted, error: convErr } = await supabase
    .from("conversations")
    .delete()
    .eq("artisan_id", profile.id)
    .eq("customer_user_id", customerUserId)
    .select("id");

  if (convErr) return { ok: false, error: "delete_failed" };

  // Sans policy DELETE, RLS renvoie 0 ligne sans erreur : on refuse plutôt que
  // d'annoncer une suppression qui n'a pas eu lieu.
  if ((convBefore?.length ?? 0) > 0 && (convDeleted?.length ?? 0) === 0) {
    return { ok: false, error: "rls_blocked" };
  }

  const { error: apptErr } = await supabase
    .from("appointments")
    .delete()
    .eq("artisan_id", profile.id)
    .eq("customer_user_id", customerUserId);
  if (apptErr) return { ok: false, error: "delete_failed" };

  // Sans cela, le contact réapparaît : listArtisanContacts le reconstruit
  // à partir des invitations acceptées.
  //
  // Non bloquant : à ce stade la conversation et les rendez-vous sont déjà
  // supprimés, retourner une erreur annoncerait à tort un échec. Et si la table
  // n'existe pas (platform_invitations.sql non exécuté), aucun contact ne peut
  // en provenir — il n'y a donc rien à nettoyer.
  await supabase
    .from("platform_invitations")
    .delete()
    .eq("inviter_user_id", user.id)
    .eq("accepted_user_id", customerUserId)
    .eq("account_type", "client");

  revalidatePath("/app/contacts");
  revalidatePath("/app/messages");
  revalidatePath("/app");
  return { ok: true };
}
