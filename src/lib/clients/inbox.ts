import type { SupabaseClient } from "@supabase/supabase-js";

import { getUnreadConversationIds } from "@/lib/notifications/unread-items";
import { formatDateFr, formatDateTimeFr, parisDayKey } from "@/lib/format/date";

export type InboxTone = "danger" | "warning" | "success" | "info";
export type InboxKind = "call" | "callback" | "message" | "quote_accepted" | "quote_rejected" | "appointment" | "invoice_late";

export type InboxItem = {
  key: string;
  kind: InboxKind;
  tone: InboxTone;
  title: string;
  detail: string | null;
  at: string;
  href: string;
  clientName: string | null;
  clientId: string | null;
};

const REJECTION: Record<string, string> = {
  price: "trop cher",
  delay: "délai",
  other_provider: "autre professionnel",
  project_cancelled: "projet abandonné",
  other: "autre raison",
};

function todayParis() {
  return parisDayKey();
}

function clip(text: string | null | undefined, max = 110): string | null {
  const t = text?.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * « À traiter » : une seule liste de ce qui attend une action de l'artisan,
 * triée par urgence puis par date. Chaque ligne ouvre la fiche client.
 */
export async function loadArtisanInbox(
  supabase: SupabaseClient,
  profileId: string,
  artisanUserId: string,
): Promise<InboxItem[]> {
  const today = todayParis();
  const nowIso = new Date().toISOString();
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const [calls, callbacks, accepted, rejected, appts, invoices, convs] = await Promise.all([
    supabase
      .from("voice_call_intakes")
      .select("id, client_id, customer_name, summary, is_urgent, urgency_reason, created_at")
      .eq("artisan_id", profileId)
      .eq("status", "pending_review")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("quotes")
      .select("id, client_id, customer_name, quote_number, callback_requested_at, callback_phone")
      .eq("artisan_id", profileId)
      .not("callback_requested_at", "is", null)
      .is("callback_handled_at", null)
      .limit(50),
    supabase
      .from("quotes")
      .select("id, client_id, customer_name, quote_number, signed_at, signed_by_name")
      .eq("artisan_id", profileId)
      .eq("status", "accepted")
      .order("signed_at", { ascending: false })
      .limit(50),
    supabase
      .from("quotes")
      .select("id, client_id, customer_name, quote_number, rejected_at, rejection_reason")
      .eq("artisan_id", profileId)
      .eq("status", "rejected")
      .gte("rejected_at", since)
      .limit(20),
    supabase
      .from("appointments")
      .select("id, client_id, customer_name, start_time")
      .eq("artisan_id", profileId)
      .eq("status", "pending")
      .gt("start_time", nowIso)
      .order("start_time", { ascending: true })
      .limit(30),
    supabase
      .from("invoices")
      .select("id, client_id, customer_name, invoice_number, due_date, grand_total")
      .eq("artisan_id", profileId)
      .in("status", ["sent", "overdue"])
      .lt("due_date", today)
      .limit(30),
    supabase
      .from("conversations")
      .select("id, client_id, updated_at")
      .eq("artisan_id", profileId)
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);

  // Devis acceptés pas encore facturés.
  const acceptedIds = (accepted.data ?? []).map((q) => q.id as string);
  const { data: billed } = acceptedIds.length
    ? await supabase.from("invoices").select("quote_id").in("quote_id", acceptedIds)
    : { data: [] as { quote_id: string }[] };
  const billedSet = new Set((billed ?? []).map((b) => b.quote_id as string));

  const convRows = convs.data ?? [];
  const unread = await getUnreadConversationIds(
    supabase,
    artisanUserId,
    convRows.map((c) => c.id as string),
    profileId,
  );
  const unreadConvs = convRows.filter((c) => unread.has(c.id as string));
  const { data: lastMessages } = unreadConvs.length
    ? await supabase
        .from("messages")
        .select("conversation_id, body, created_at")
        .in(
          "conversation_id",
          unreadConvs.map((c) => c.id as string),
        )
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: [] as { conversation_id: string; body: string; created_at: string }[] };
  const lastByConv = new Map<string, { body: string; created_at: string }>();
  for (const m of lastMessages ?? []) {
    if (!lastByConv.has(m.conversation_id as string)) lastByConv.set(m.conversation_id as string, m as { body: string; created_at: string });
  }

  const clientIds = new Set<string>();
  for (const set of [calls.data, callbacks.data, accepted.data, rejected.data, appts.data, invoices.data, unreadConvs]) {
    for (const row of set ?? []) if (row.client_id) clientIds.add(row.client_id as string);
  }
  const { data: clients } = clientIds.size
    ? await supabase.from("clients").select("id, display_name").in("id", [...clientIds])
    : { data: [] as { id: string; display_name: string }[] };
  const nameById = new Map((clients ?? []).map((c) => [c.id as string, c.display_name as string]));
  const nameOf = (clientId: unknown, fallback: unknown) =>
    (clientId ? nameById.get(clientId as string) : null) ?? ((fallback as string | null)?.trim() || null);

  const items: InboxItem[] = [];

  for (const c of calls.data ?? []) {
    items.push({
      key: `call-${c.id}`,
      kind: "call",
      tone: c.is_urgent ? "danger" : "warning",
      title: c.is_urgent ? "Appel urgent à traiter" : "Appel Soline à traiter",
      detail: clip(c.is_urgent && c.urgency_reason ? (c.urgency_reason as string) : (c.summary as string | null)),
      at: c.created_at as string,
      href: "/app/appels",
      clientName: nameOf(c.client_id, c.customer_name),
      clientId: (c.client_id as string | null) ?? null,
    });
  }
  for (const q of callbacks.data ?? []) {
    items.push({
      key: `cb-${q.id}`,
      kind: "callback",
      tone: "warning",
      title: "Demande à être rappelé",
      detail: `Devis n° ${q.quote_number ?? "—"}${q.callback_phone ? ` · ${q.callback_phone}` : ""}`,
      at: q.callback_requested_at as string,
      href: `/app/quotes/${q.id}`,
      clientName: nameOf(q.client_id, q.customer_name),
      clientId: (q.client_id as string | null) ?? null,
    });
  }
  for (const c of unreadConvs) {
    const last = lastByConv.get(c.id as string);
    items.push({
      key: `msg-${c.id}`,
      kind: "message",
      tone: "info",
      title: "Nouveau message",
      detail: clip(last?.body),
      at: last?.created_at ?? (c.updated_at as string),
      href: `/app/messages/${c.id}`,
      clientName: nameOf(c.client_id, null),
      clientId: (c.client_id as string | null) ?? null,
    });
  }
  for (const q of accepted.data ?? []) {
    if (billedSet.has(q.id as string)) continue;
    items.push({
      key: `acc-${q.id}`,
      kind: "quote_accepted",
      tone: "success",
      title: "Devis accepté : planifier et facturer",
      detail: `Devis n° ${q.quote_number ?? "—"}${q.signed_by_name ? ` · signé par ${q.signed_by_name}` : ""}`,
      at: (q.signed_at as string | null) ?? nowIso,
      href: `/app/quotes/${q.id}`,
      clientName: nameOf(q.client_id, q.customer_name),
      clientId: (q.client_id as string | null) ?? null,
    });
  }
  for (const a of appts.data ?? []) {
    items.push({
      key: `appt-${a.id}`,
      kind: "appointment",
      tone: "warning",
      title: "Rendez-vous à confirmer",
      detail: formatDateTimeFr(a.start_time as string, { dateStyle: "full", timeStyle: "short" }),
      at: a.start_time as string,
      href: "/app/rdv",
      clientName: nameOf(a.client_id, a.customer_name),
      clientId: (a.client_id as string | null) ?? null,
    });
  }
  for (const inv of invoices.data ?? []) {
    items.push({
      key: `late-${inv.id}`,
      kind: "invoice_late",
      tone: "danger",
      title: "Facture en retard de paiement",
      detail: `${inv.invoice_number ?? ""} · échéance ${formatDateFr(inv.due_date as string)}`,
      at: `${inv.due_date}T00:00:00Z`,
      href: `/app/invoices/${inv.id}`,
      clientName: nameOf(inv.client_id, inv.customer_name),
      clientId: (inv.client_id as string | null) ?? null,
    });
  }
  for (const q of rejected.data ?? []) {
    items.push({
      key: `rej-${q.id}`,
      kind: "quote_rejected",
      tone: "info",
      title: "Devis refusé",
      detail: `Devis n° ${q.quote_number ?? "—"}${q.rejection_reason ? ` · ${REJECTION[q.rejection_reason as string] ?? ""}` : ""}`,
      at: q.rejected_at as string,
      href: `/app/quotes/${q.id}`,
      clientName: nameOf(q.client_id, q.customer_name),
      clientId: (q.client_id as string | null) ?? null,
    });
  }

  const rank: Record<InboxTone, number> = { danger: 0, warning: 1, success: 2, info: 3 };
  items.sort((a, b) => rank[a.tone] - rank[b.tone] || b.at.localeCompare(a.at));
  return items;
}
