import type { SupabaseClient } from "@supabase/supabase-js";

import { invoiceTypeLabel } from "@/lib/billing/invoice-types";
import { formatDateFr, formatDateTimeFr, parisDayKey } from "@/lib/format/date";
import { formatCents } from "@/lib/format/money";

export type TimelineKind = "call" | "message" | "quote" | "invoice" | "appointment" | "project" | "callback";
export type TimelineTone = "neutral" | "info" | "success" | "warning" | "danger";

type TimelineItem = {
  key: string;
  kind: TimelineKind;
  /** Élément déplaçable vers une autre fiche (« Pas ce client ? »). */
  detachable: { table: "quotes" | "voice_call_intakes" | "appointments"; id: string } | null;
  at: string;
  title: string;
  detail: string | null;
  badge: { label: string; tone: TimelineTone } | null;
  href: string | null;
  fromClient?: boolean;
};

type ClientTodo = { key: string; label: string; href: string; tone: TimelineTone };

const QUOTE_STATUS: Record<string, { label: string; tone: TimelineTone }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  sent: { label: "Envoyé", tone: "info" },
  accepted: { label: "Accepté", tone: "success" },
  rejected: { label: "Refusé", tone: "danger" },
};

const REJECTION: Record<string, string> = {
  price: "prix",
  delay: "délai",
  other_provider: "autre professionnel",
  project_cancelled: "projet abandonné",
  other: "autre raison",
};

function short(text: string | null | undefined, max = 160): string | null {
  const t = text?.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function todayIso() {
  return parisDayKey();
}

/**
 * Fil chronologique d'une fiche client : appels Soline, messages, devis, factures,
 * RDV, chantiers — tout ce qui porte ce client_id. Lecture sous RLS artisan.
 */
export async function loadClientTimeline(
  supabase: SupabaseClient,
  clientId: string,
  artisanUserId: string,
): Promise<{ items: TimelineItem[]; todos: ClientTodo[]; conversationIds: string[] }> {
  const [calls, quotes, invoices, appts, convs, projects] = await Promise.all([
    supabase
      .from("voice_call_intakes")
      .select("id, created_at, summary, status, is_urgent, urgency_reason, quote_id")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("quotes")
      .select(
        "id, created_at, sent_at, status, quote_number, grand_total, signed_at, signed_by_name, rejected_at, rejection_reason, viewed_at, callback_requested_at, callback_handled_at, callback_phone",
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("invoices")
      .select("id, created_at, finalized_at, invoice_number, invoice_type, status, grand_total, due_date, quote_id")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("appointments")
      .select("id, created_at, start_time, status, source, notes")
      .eq("client_id", clientId)
      .order("start_time", { ascending: false })
      .limit(50),
    supabase.from("conversations").select("id").eq("client_id", clientId),
    supabase
      .from("projects")
      .select("id, created_at, name, status")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const conversationIds = (convs.data ?? []).map((c) => c.id as string);
  const { data: messages } = conversationIds.length
    ? await supabase
        .from("messages")
        .select("id, conversation_id, sender_user_id, kind, body, created_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false })
        .limit(30)
    : { data: [] as { id: string; conversation_id: string; sender_user_id: string | null; kind: string; body: string; created_at: string }[] };

  const items: TimelineItem[] = [];
  const todos: ClientTodo[] = [];
  const today = todayIso();

  for (const c of calls.data ?? []) {
    const pending = c.status === "pending_review";
    items.push({
      key: `call-${c.id}`,
      kind: "call",
      detachable: { table: "voice_call_intakes", id: c.id as string },
      at: c.created_at as string,
      title: "Appel reçu par Soline",
      detail: short(c.is_urgent && c.urgency_reason ? `${c.urgency_reason} — ${c.summary ?? ""}` : c.summary, 240),
      badge: c.is_urgent && pending ? { label: "Urgent", tone: "danger" } : pending ? { label: "À traiter", tone: "warning" } : null,
      href: c.quote_id ? `/app/quotes/${c.quote_id}` : "/app/appels",
    });
    if (pending) todos.push({ key: `call-${c.id}`, label: "Appel Soline à traiter (devis proposé)", href: "/app/appels", tone: c.is_urgent ? "danger" : "warning" });
  }

  for (const q of quotes.data ?? []) {
    const status = QUOTE_STATUS[q.status as string] ?? QUOTE_STATUS.draft!;
    const number = (q.quote_number as string | null) ?? "brouillon";
    const parts: string[] = [formatCents((q.grand_total as number) ?? 0) + " HT"];
    if (q.status === "sent") parts.push(q.viewed_at ? "consulté par le client" : "pas encore consulté");
    if (q.status === "accepted" && q.signed_by_name) parts.push(`signé par ${q.signed_by_name}`);
    if (q.status === "rejected" && q.rejection_reason) parts.push(`motif : ${REJECTION[q.rejection_reason as string] ?? "—"}`);
    items.push({
      key: `quote-${q.id}`,
      kind: "quote",
      detachable: { table: "quotes", id: q.id as string },
      at: ((q.signed_at ?? q.rejected_at ?? q.sent_at ?? q.created_at) as string),
      title: `Devis n° ${number}`,
      detail: parts.join(" · "),
      badge: status,
      href: `/app/quotes/${q.id}`,
    });
    if (q.callback_requested_at) {
      items.push({
        key: `callback-${q.id}`,
        kind: "callback",
        detachable: null,
        at: q.callback_requested_at as string,
        title: "Demande de rappel",
        detail: q.callback_phone ? `Au ${q.callback_phone}` : null,
        badge: q.callback_handled_at ? { label: "Traité", tone: "neutral" } : { label: "À rappeler", tone: "warning" },
        href: `/app/quotes/${q.id}`,
      });
      if (!q.callback_handled_at) todos.push({ key: `cb-${q.id}`, label: "Le client demande à être rappelé", href: `/app/quotes/${q.id}`, tone: "warning" });
    }
    if (q.status === "draft") todos.push({ key: `draft-${q.id}`, label: "Devis en brouillon à envoyer", href: `/app/quotes/${q.id}`, tone: "info" });
  }

  const invoicedQuotes = new Set((invoices.data ?? []).map((i) => i.quote_id as string));
  for (const q of quotes.data ?? []) {
    if (q.status === "accepted" && !invoicedQuotes.has(q.id as string)) {
      todos.push({ key: `bill-${q.id}`, label: `Devis n° ${q.quote_number ?? ""} accepté, pas encore facturé`, href: `/app/quotes/${q.id}`, tone: "success" });
    }
  }

  for (const inv of invoices.data ?? []) {
    const overdue = (inv.status === "sent" || inv.status === "overdue") && inv.due_date && (inv.due_date as string) < today;
    const badge: TimelineItem["badge"] =
      inv.status === "paid"
        ? { label: "Payée", tone: "success" }
        : overdue
          ? { label: "En retard", tone: "danger" }
          : inv.status === "draft"
            ? { label: "Brouillon", tone: "neutral" }
            : { label: "Envoyée", tone: "info" };
    items.push({
      key: `invoice-${inv.id}`,
      kind: "invoice",
      detachable: null,
      at: ((inv.finalized_at ?? inv.created_at) as string),
      title: `${invoiceTypeLabel(inv.invoice_type as string)} ${inv.invoice_number ?? ""}`.trim(),
      detail: `${formatCents((inv.grand_total as number) ?? 0)}${inv.due_date && inv.status !== "paid" ? ` · échéance ${formatDateFr(inv.due_date as string)}` : ""}`,
      badge,
      href: `/app/invoices/${inv.id}`,
    });
    if (overdue) todos.push({ key: `late-${inv.id}`, label: `Facture ${inv.invoice_number ?? ""} en retard de paiement`, href: `/app/invoices/${inv.id}`, tone: "danger" });
  }

  for (const a of appts.data ?? []) {
    const when = formatDateTimeFr(a.start_time as string, { dateStyle: "full", timeStyle: "short" });
    const upcoming = new Date(a.start_time as string).getTime() > Date.now();
    items.push({
      key: `appt-${a.id}`,
      kind: "appointment",
      detachable: { table: "appointments", id: a.id as string },
      at: a.created_at as string,
      title: `Rendez-vous ${upcoming ? "prévu" : ""} le ${when}`.replace("  ", " "),
      detail: short(a.notes as string | null),
      badge:
        a.status === "cancelled"
          ? { label: "Annulé", tone: "neutral" }
          : a.status === "pending"
            ? { label: "À confirmer", tone: "warning" }
            : { label: "Confirmé", tone: "success" },
      href: "/app/rdv",
    });
    if (a.status === "pending" && upcoming) todos.push({ key: `appt-${a.id}`, label: "Rendez-vous à confirmer", href: "/app/rdv", tone: "warning" });
  }

  for (const m of messages ?? []) {
    if (m.kind === "lead_recap") continue;
    const fromClient = m.sender_user_id !== artisanUserId;
    items.push({
      key: `msg-${m.id}`,
      kind: "message",
      detachable: null,
      at: m.created_at as string,
      title: fromClient ? "Message du client" : "Votre message",
      detail: short(m.body as string, 400),
      badge: null,
      href: `/app/messages/${m.conversation_id}`,
      fromClient,
    });
  }

  for (const p of projects.data ?? []) {
    items.push({
      key: `project-${p.id}`,
      kind: "project",
      detachable: null,
      at: p.created_at as string,
      title: `Chantier : ${p.name}`,
      detail: null,
      badge: p.status === "completed" ? { label: "Terminé", tone: "success" } : p.status === "cancelled" ? { label: "Annulé", tone: "neutral" } : { label: "En cours", tone: "info" },
      href: `/app/chantiers/${p.id}`,
    });
  }

  items.sort((a, b) => b.at.localeCompare(a.at));
  const toneRank: Record<TimelineTone, number> = { danger: 0, warning: 1, success: 2, info: 3, neutral: 4 };
  todos.sort((a, b) => toneRank[a.tone] - toneRank[b.tone]);
  return { items, todos, conversationIds };
}
