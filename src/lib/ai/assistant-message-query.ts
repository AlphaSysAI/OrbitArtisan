import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { looksLikeOpenCommand } from "@/lib/ai/assistant-fast-path";
import { extractFrenchDates } from "@/lib/ai/extract-dates";
import { formatIsoDateFr } from "@/lib/ai/resolve-date";
import { matchContactByQuery, type ContactCandidate } from "@/lib/ai/match-contact";

export type IncomingMessageHit = {
  conversationId: string;
  contactLabel: string;
  messageId: string;
  body: string;
  createdAt: string;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isExplicitQuestion(message: string): boolean {
  if (/\?\s*$/.test(message.trim())) return true;
  return /\b(ai[- ]?je|est[- ]?ce que|combien|y a[- ]?t[- ]?il|as[- ]?tu|aurai[- ]?je|dis[- ]?moi|suis[- ]?je)\b/.test(
    normalize(message),
  );
}

/** Message reçu / envoi / messagerie (pas RDV). */
export function looksLikeMessageTopic(message: string): boolean {
  const m = normalize(message);
  return /\b(message|messages|messagerie|conversation|sms|ecrit|recu|recue|envoye|envoyee)\b/.test(m);
}

export function looksLikeMessageDataQuestion(message: string): boolean {
  if (!looksLikeMessageTopic(message)) return false;
  return isExplicitQuestion(message) || /\b(recu|reçu|envoye|envoyé|dernier|derniere|nouveau|nouvelle)\b/i.test(message);
}

export function looksLikeOpenMessageCommand(message: string): boolean {
  if (!looksLikeMessageTopic(message)) return false;
  if (!looksLikeOpenCommand(message)) return false;
  const m = normalize(message);
  // Fil ou contact précis — pas la simple liste « ouvre mes messages »
  return (
    /\b(dernier|derniere|recent|recente|nouveau|nouvelle|recu|recue)\b/.test(m) ||
    /\b(de|du|d |avec|par)\s+[a-z0-9]/.test(m)
  );
}

/** Extrait un nom de contact après « de / avec … ». */
export function extractContactQueryFromMessage(message: string): string | null {
  const patterns = [
    /\b(?:message|messages|messagerie|conversation|sms)\s+(?:de|du|d['']|avec|from|par)\s+(.+?)(?:\s+le\s+\d|\s*\?|$)/i,
    /\b(?:recu|reçu|envoye|envoyé|dernier|derniere)\s+(?:message\s+)?(?:de|du|d['']|avec|from|par)\s+(.+?)(?:\s+le\s+\d|\s*\?|$)/i,
    /\b(?:de|du|d['']|avec|from|par)\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s'.-]{1,80}?)(?:\s+le\s+\d|\s*\?|$)/i,
  ];

  for (const re of patterns) {
    const m = message.match(re);
    if (!m?.[1]) continue;
    let name = m[1]
      .replace(/\s+(le|les|la|un|une|du|de|des|en|sur|pour)\s+.*$/i, "")
      .trim();
    if (
      name.length >= 2 &&
      !/\b(rdv|rendez|demain|aujourd|message|messages|dernier|recu|recue|septembre|janvier|fevrier|mars|avril|mai|juin|juillet|aout|octobre|novembre|decembre)\b/i.test(
        name,
      )
    ) {
      return name;
    }
  }
  return null;
}

function dayKey(isoOrTs: string): string {
  const d = new Date(isoOrTs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isIncomingForArtisan(
  senderUserId: string | null,
  kind: string | null,
  artisanUserId: string,
): boolean {
  if (senderUserId && senderUserId !== artisanUserId) return true;
  if (!senderUserId && kind === "lead_recap") return true;
  return false;
}

function truncateBody(body: string, max = 120): string {
  const t = body.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

async function conversationIdsForArtisan(
  supabase: SupabaseClient,
  artisanId: string,
  contacts: ContactCandidate[],
  contactQuery: string | null,
): Promise<Map<string, string>> {
  const { data: convs } = await supabase
    .from("conversations")
    .select("id, customer_user_id, lead_id")
    .eq("artisan_id", artisanId);

  const labelByConv = new Map<string, string>();
  for (const c of convs ?? []) {
    const matched = contacts.find(
      (ct) =>
        (ct.conversationId && ct.conversationId === c.id) ||
        (ct.customerUserId && ct.customerUserId === c.customer_user_id),
    );
    labelByConv.set(c.id, matched?.label ?? "Contact");
  }

  if (!contactQuery?.trim()) return labelByConv;

  const match = matchContactByQuery(contactQuery, contacts);
  if (!match?.contact.conversationId) {
    const filtered = new Map<string, string>();
    for (const [id, label] of labelByConv) {
      if (normalize(label).includes(normalize(contactQuery)) || normalize(contactQuery).includes(normalize(label))) {
        filtered.set(id, label);
      }
    }
    return filtered.size ? filtered : labelByConv;
  }

  const single = new Map<string, string>();
  single.set(match.contact.conversationId, match.contact.label);
  return single;
}

export async function findIncomingMessages(
  supabase: SupabaseClient,
  artisanId: string,
  artisanUserId: string,
  contacts: ContactCandidate[],
  opts?: { contactQuery?: string | null; dateIsos?: string[]; limit?: number },
): Promise<IncomingMessageHit[]> {
  const convMap = await conversationIdsForArtisan(
    supabase,
    artisanId,
    contacts,
    opts?.contactQuery ?? null,
  );
  const convIds = [...convMap.keys()];
  if (!convIds.length) return [];

  const { data: rows, error } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_user_id, kind, body, created_at")
    .in("conversation_id", convIds)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[assistant-message-query]", error);
    return [];
  }

  const dateSet = opts?.dateIsos?.length ? new Set(opts.dateIsos) : null;
  const hits: IncomingMessageHit[] = [];

  for (const row of rows ?? []) {
    if (!isIncomingForArtisan(row.sender_user_id as string | null, row.kind as string | null, artisanUserId)) {
      continue;
    }
    if (dateSet && !dateSet.has(dayKey(row.created_at as string))) continue;

    hits.push({
      conversationId: row.conversation_id as string,
      contactLabel: convMap.get(row.conversation_id as string) ?? "Contact",
      messageId: row.id as string,
      body: row.body as string,
      createdAt: row.created_at as string,
    });
    if (opts?.limit && hits.length >= opts.limit) break;
  }

  return hits;
}

export async function tryOpenMessageNavigation(
  supabase: SupabaseClient,
  artisanId: string,
  artisanUserId: string,
  message: string,
  contacts: ContactCandidate[],
): Promise<{ href: string; label: string; reply: string } | null> {
  if (!looksLikeOpenMessageCommand(message)) return null;

  const contactQuery = extractContactQueryFromMessage(message);
  const hits = await findIncomingMessages(supabase, artisanId, artisanUserId, contacts, {
    contactQuery,
    limit: 1,
  });

  if (!hits.length) {
    if (contactQuery) {
      return {
        href: "/app/messages",
        label: "Messages",
        reply: `Je n’ai trouvé aucun message reçu de « ${contactQuery} ». J’ouvre ta messagerie.`,
      };
    }
    return {
      href: "/app/messages",
      label: "Messages",
      reply: "Tu n’as pas encore de message entrant. J’ouvre ta messagerie.",
    };
  }

  const hit = hits[0]!;
  const when = new Date(hit.createdAt).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return {
    href: `/app/messages/${hit.conversationId}`,
    label: `Message · ${hit.contactLabel}`,
    reply: `J’ouvre la conversation avec ${hit.contactLabel} — dernier message reçu le ${when} : « ${truncateBody(hit.body)} »`,
  };
}

export async function answerMessageQuestion(
  supabase: SupabaseClient,
  artisanId: string,
  artisanUserId: string,
  message: string,
  contacts: ContactCandidate[],
): Promise<{ reply: string; href: string | null; label: string | null } | null> {
  if (!looksLikeMessageDataQuestion(message)) return null;

  const contactQuery = extractContactQueryFromMessage(message);
  const dates = extractFrenchDates(message);
  const hits = await findIncomingMessages(supabase, artisanId, artisanUserId, contacts, {
    contactQuery,
    dateIsos: dates.length ? dates : undefined,
    limit: 5,
  });

  if (!hits.length) {
    const who = contactQuery ? ` de ${contactQuery}` : "";
    const when =
      dates.length === 1
        ? ` le ${formatIsoDateFr(dates[0]!)}`
        : dates.length > 1
          ? ` les ${dates.map(formatIsoDateFr).join(", ")}`
          : "";
    return {
      reply: `Non — je ne vois aucun message reçu${who}${when}.`,
      href: "/app/messages",
      label: "Messages",
    };
  }

  const hit = hits[0]!;
  const when = new Date(hit.createdAt).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });

  if (hits.length === 1) {
    return {
      reply: `Oui — ${hit.contactLabel} t’a écrit le ${when} : « ${truncateBody(hit.body)} »`,
      href: `/app/messages/${hit.conversationId}`,
      label: `Conversation · ${hit.contactLabel}`,
    };
  }

  const lines = hits
    .slice(0, 3)
    .map((h) => {
      const t = new Date(h.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
      return `• ${h.contactLabel} (${t}) : « ${truncateBody(h.body, 80)} »`;
    })
    .join("\n");

  return {
    reply: `Oui — ${hits.length} message${hits.length > 1 ? "s" : ""} reçu${hits.length > 1 ? "s" : ""} :\n${lines}`,
    href: `/app/messages/${hit.conversationId}`,
    label: "Voir la conversation",
  };
}
