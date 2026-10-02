import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadQuotePdfDocument } from "@/lib/billing/load-quote-pdf";
import { renderQuotePdf } from "@/lib/billing/render-quote-pdf";
import { emailButton, escapeHtml } from "@/lib/email/html";
import { sendEmail } from "@/lib/email/send-email";
import { notifyQuoteAccepted, notifyQuoteRejected } from "@/lib/notifications/notify-events";
import { notifyUserActivity } from "@/lib/notifications/send-push";
import { computeQuoteDocumentHash } from "@/lib/quotes/quote-document-hash";
import { quoteResponseUrl } from "@/lib/quotes/response-link";
import { getPublicSiteUrl } from "@/lib/site-url";
import { parisDayKey } from "@/lib/format/date";
import { formatCents } from "@/lib/format/money";
import { formatPhoneFr, normalizeCustomerPhone } from "@/lib/phone";
import { vatCertificationScope } from "@/lib/billing/vat-certification";

type Db = SupabaseClient;

export const REJECTION_REASONS = {
  price: "Le prix",
  delay: "Le délai",
  other_provider: "J'ai choisi un autre professionnel",
  project_cancelled: "Projet abandonné ou reporté",
  other: "Autre raison",
} as const;
type RejectionReason = keyof typeof REJECTION_REASONS;

export function isRejectionReason(v: unknown): v is RejectionReason {
  return typeof v === "string" && v in REJECTION_REASONS;
}

type QuoteResponseView = {
  id: string;
  artisanId: string;
  status: "draft" | "sent" | "accepted" | "rejected";
  quoteNumber: string;
  customerName: string | null;
  customerEmail: string | null;
  customerUserId: string | null;
  clientId: string | null;
  conversationId: string | null;
  totalTtcCents: number;
  totalHtCents: number;
  vatFranchise: boolean;
  validUntil: string | null;
  expired: boolean;
  sentAt: string | null;
  signedAt: string | null;
  signedByName: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  callbackRequestedAt: string | null;
  artisan: {
    businessName: string;
    phone: string | null;
    logoUrl: string | null;
    accentColor: string | null;
    slug: string | null;
    userId: string;
  };
  clientPhone: string | null;
  /** Texte de certification TVA taux réduit à valider à l'acceptation (vide = taux normal). */
  vatCertificationLines: string[];
};

function todayParis(): string {
  return parisDayKey();
}

export async function loadQuoteForResponse(db: Db, quoteId: string): Promise<QuoteResponseView | null> {
  const { data: q } = await db
    .from("quotes")
    .select(
      "id, artisan_id, status, quote_number, customer_name, customer_email, customer_user_id, client_id, conversation_id, grand_total, valid_until, sent_at, signed_at, signed_by_name, rejected_at, rejection_reason, callback_requested_at",
    )
    .eq("id", quoteId)
    .maybeSingle();
  if (!q || q.status === "draft") return null;

  const [{ data: artisan }, { data: client }, doc] = await Promise.all([
    db.from("profiles").select("user_id, business_name, phone, logo_url, accent_color, slug").eq("id", q.artisan_id).maybeSingle(),
    q.client_id
      ? db.from("clients").select("phone").eq("id", q.client_id).maybeSingle()
      : Promise.resolve({ data: null as { phone: string | null } | null }),
    loadQuotePdfDocument(db, quoteId, q.artisan_id as string, { issuerClient: db }),
  ]);
  if (!artisan) return null;

  const validUntil = (q.valid_until as string | null) ?? null;
  return {
    id: q.id as string,
    artisanId: q.artisan_id as string,
    status: q.status as QuoteResponseView["status"],
    quoteNumber: doc?.quoteNumber ?? (q.quote_number as string | null) ?? (q.id as string).slice(0, 8).toUpperCase(),
    customerName: (q.customer_name as string | null) ?? null,
    customerEmail: (q.customer_email as string | null) ?? null,
    customerUserId: (q.customer_user_id as string | null) ?? null,
    clientId: (q.client_id as string | null) ?? null,
    conversationId: (q.conversation_id as string | null) ?? null,
    totalTtcCents: doc?.totalTtcCents ?? ((q.grand_total as number) ?? 0),
    totalHtCents: doc?.totalHtCents ?? ((q.grand_total as number) ?? 0),
    vatFranchise: Boolean(doc?.vatFranchise),
    validUntil,
    expired: q.status === "sent" && !!validUntil && validUntil < todayParis(),
    sentAt: (q.sent_at as string | null) ?? null,
    signedAt: (q.signed_at as string | null) ?? null,
    signedByName: (q.signed_by_name as string | null) ?? null,
    rejectedAt: (q.rejected_at as string | null) ?? null,
    rejectionReason: (q.rejection_reason as string | null) ?? null,
    callbackRequestedAt: (q.callback_requested_at as string | null) ?? null,
    artisan: {
      businessName: (artisan.business_name as string) || "Votre artisan",
      phone: (artisan.phone as string | null) ?? null,
      logoUrl: (artisan.logo_url as string | null) ?? null,
      accentColor: (artisan.accent_color as string | null) ?? null,
      slug: (artisan.slug as string | null) ?? null,
      userId: artisan.user_id as string,
    },
    clientPhone: (client?.phone as string | null) ?? null,
    vatCertificationLines: doc?.vatCertification?.lines ?? [],
  };
}

/** Le devis comporte-t-il une ligne à taux réduit (main-d'œuvre ou fourniture) ? */
export async function quoteRequiresVatCertification(db: Db, quoteId: string): Promise<boolean> {
  const [{ data: quote }, { data: materials }] = await Promise.all([
    db.from("quotes").select("reduced_vat_rate").eq("id", quoteId).maybeSingle(),
    db.from("quote_materials").select("vat_rate, exclude_from_invoice").eq("quote_id", quoteId),
  ]);
  const rates = [
    Number(quote?.reduced_vat_rate ?? 20),
    ...(materials ?? []).filter((m) => !m.exclude_from_invoice).map((m) => Number(m.vat_rate ?? 20)),
  ];
  return vatCertificationScope(rates).required;
}

/** Premier affichage de la page par le client : alimente « consulté » côté artisan. */
export async function markQuoteViewed(db: Db, quoteId: string): Promise<void> {
  await db.from("quotes").update({ viewed_at: new Date().toISOString() }).eq("id", quoteId).is("viewed_at", null);
}

async function artisanEmail(db: Db, userId: string): Promise<string | null> {
  const { data } = await db.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

async function computeHash(db: Db, quoteId: string): Promise<string> {
  const [{ data: quote }, { data: services }, { data: materials }] = await Promise.all([
    db
      .from("quotes")
      .select("id, quote_number, grand_total, labor_total, materials_total, reduced_vat_rate, valid_until, sent_at")
      .eq("id", quoteId)
      .single(),
    db
      .from("quote_services")
      .select("service_title, duration_minutes, unit_price, line_total")
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: true }),
    db
      .from("quote_materials")
      .select("label, quantity, unit_price, line_total, vat_rate, exclude_from_invoice")
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: true }),
  ]);
  return computeQuoteDocumentHash({ quote: quote!, services: services ?? [], materials: materials ?? [] });
}

export type ResponseResult =
  | { ok: true }
  | {
      ok: false;
      error: "not_found" | "not_acceptable" | "invalid_name" | "invalid_input" | "rate_limited" | "certification_required";
    };

/** Acceptation par le client depuis le lien e-mail. Mêmes règles que client_accept_quote. */
export async function acceptQuoteByLink(
  db: Db,
  quoteId: string,
  input: { signerName: string; ip: string | null; userAgent: string | null; vatCertified?: boolean },
): Promise<ResponseResult> {
  const name = input.signerName.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) return { ok: false, error: "invalid_name" };

  const view = await loadQuoteForResponse(db, quoteId);
  if (!view) return { ok: false, error: "not_found" };
  if (view.status !== "sent" || view.expired) return { ok: false, error: "not_acceptable" };
  // Taux réduit : la certification du client est la condition du taux (art. 279-0 bis CGI).
  const certify = view.vatCertificationLines.length > 0;
  if (certify && !input.vatCertified) return { ok: false, error: "certification_required" };

  const hash = await computeHash(db, quoteId);
  const signedAt = new Date().toISOString();
  let update = db
    .from("quotes")
    .update({
      status: "accepted",
      signed_at: signedAt,
      signed_by_name: name,
      signed_ip: input.ip?.slice(0, 64) ?? null,
      signed_user_agent: input.userAgent?.slice(0, 400) ?? null,
      signed_document_hash: hash,
      response_channel: "email_link",
      vat_certified_at: certify ? signedAt : null,
      rejected_at: null,
    })
    .eq("id", quoteId)
    .eq("status", "sent");
  if (view.validUntil) update = update.gte("valid_until", todayParis());
  const { data: updated } = await update.select("id");
  if (!updated?.length) return { ok: false, error: "not_acceptable" };

  void notifyQuoteAccepted(db, { quoteId, artisanId: view.artisanId, signerName: name });
  void sendAcceptanceEmails(db, view, name);
  return { ok: true };
}

async function sendAcceptanceEmails(db: Db, view: QuoteResponseView, signerName: string): Promise<void> {
  try {
    const doc = await loadQuotePdfDocument(db, view.id, view.artisanId, { issuerClient: db });
    const pdf = doc ? Buffer.from(await renderQuotePdf(doc)).toString("base64") : null;
    const attachments = pdf ? [{ filename: `devis-${view.quoteNumber.replace(/[^\w-]+/g, "-")}-accepte.pdf`, content: pdf }] : undefined;
    const total = formatCents(view.totalTtcCents);

    if (view.customerEmail) {
      await sendEmail({
        to: view.customerEmail,
        subject: `Devis n° ${view.quoteNumber} accepté — ${view.artisan.businessName}`,
        html: `
          <p>Bonjour ${escapeHtml(signerName)},</p>
          <p>Vous avez accepté le devis n° <strong>${escapeHtml(view.quoteNumber)}</strong> de <strong>${escapeHtml(view.artisan.businessName)}</strong> (${escapeHtml(total)}${view.vatFranchise ? "" : " TTC"}).</p>
          <p>Vous trouverez en pièce jointe le devis portant la mention de votre acceptation, à conserver. ${escapeHtml(view.artisan.businessName)} va revenir vers vous pour organiser les travaux.</p>
          ${emailButton(quoteResponseUrl(view.id), "Voir mon devis")}
          <p style="color:#64748b;font-size:12px">Acceptation électronique horodatée. Si vous n'êtes pas à l'origine de cette acceptation, contactez immédiatement l'artisan.</p>`,
        text: `Vous avez accepté le devis n° ${view.quoteNumber} de ${view.artisan.businessName} (${total}${view.vatFranchise ? "" : " TTC"}).`,
        attachments,
      });
    }

    const to = await artisanEmail(db, view.artisan.userId);
    if (to) {
      await sendEmail({
        to,
        subject: `✅ Devis n° ${view.quoteNumber} accepté par ${signerName}`,
        html: `
          <p><strong>${escapeHtml(signerName)}</strong> vient d'accepter votre devis n° <strong>${escapeHtml(view.quoteNumber)}</strong> (${escapeHtml(total)}${view.vatFranchise ? "" : " TTC"}).</p>
          ${emailButton(`${getPublicSiteUrl()}/app/quotes/${view.id}`, "Ouvrir le devis")}
          <p style="color:#64748b;font-size:12px">Le devis accepté est joint. Pensez à planifier l'intervention et, si prévu, à émettre la facture d'acompte.</p>`,
        text: `${signerName} a accepté le devis n° ${view.quoteNumber} (${total}${view.vatFranchise ? "" : " TTC"}).`,
        attachments,
      });
    }
  } catch (error) {
    console.error("[devis] e-mails d'acceptation", view.id, error);
  }
}

export async function rejectQuoteByLink(
  db: Db,
  quoteId: string,
  input: { reason: string; comment: string | null },
): Promise<ResponseResult> {
  if (!isRejectionReason(input.reason)) return { ok: false, error: "invalid_input" };
  const comment = input.comment?.trim().slice(0, 1000) || null;

  const view = await loadQuoteForResponse(db, quoteId);
  if (!view) return { ok: false, error: "not_found" };
  if (view.status !== "sent") return { ok: false, error: "not_acceptable" };

  const { data: updated } = await db
    .from("quotes")
    .update({
      status: "rejected",
      rejected_at: new Date().toISOString(),
      rejection_reason: input.reason,
      rejection_comment: comment,
      response_channel: "email_link",
    })
    .eq("id", quoteId)
    .eq("status", "sent")
    .select("id");
  if (!updated?.length) return { ok: false, error: "not_acceptable" };

  void notifyQuoteRejected(db, { quoteId, artisanId: view.artisanId });
  void (async () => {
    const to = await artisanEmail(db, view.artisan.userId);
    if (!to) return;
    const who = view.customerName?.trim() || "Votre client";
    await sendEmail({
      to,
      subject: `Devis n° ${view.quoteNumber} décliné par ${who}`,
      html: `
        <p><strong>${escapeHtml(who)}</strong> a décliné votre devis n° <strong>${escapeHtml(view.quoteNumber)}</strong>.</p>
        <p>Motif : <strong>${escapeHtml(REJECTION_REASONS[input.reason as RejectionReason])}</strong>${comment ? `<br/>« ${escapeHtml(comment)} »` : ""}</p>
        ${emailButton(`${getPublicSiteUrl()}/app/quotes/${view.id}`, "Voir le devis")}`,
      text: `${who} a décliné le devis n° ${view.quoteNumber}. Motif : ${REJECTION_REASONS[input.reason as RejectionReason]}${comment ? ` — ${comment}` : ""}`,
    });
  })().catch((e) => console.error("[devis] e-mail de refus", quoteId, e));
  return { ok: true };
}

/** « Être rappelé » : l'artisan est prévenu avec le bon numéro. */
export async function requestCallbackByLink(db: Db, quoteId: string, rawPhone: string): Promise<ResponseResult> {
  const phone = normalizeCustomerPhone(rawPhone);
  if (!phone) return { ok: false, error: "invalid_input" };

  const view = await loadQuoteForResponse(db, quoteId);
  if (!view) return { ok: false, error: "not_found" };

  // Anti-spam : une demande toutes les 30 minutes au plus.
  if (view.callbackRequestedAt && Date.now() - new Date(view.callbackRequestedAt).getTime() < 30 * 60_000) {
    return { ok: true };
  }

  await db
    .from("quotes")
    .update({ callback_requested_at: new Date().toISOString(), callback_handled_at: null, callback_phone: phone })
    .eq("id", quoteId);
  if (view.clientId) {
    await db.from("clients").update({ phone }).eq("id", view.clientId).is("phone", null);
  }

  const who = view.customerName?.trim() || "Un client";
  const national = formatPhoneFr(phone);
  const url = view.clientId ? `${getPublicSiteUrl()}/app/clients/${view.clientId}` : `${getPublicSiteUrl()}/app/quotes/${view.id}`;
  notifyUserActivity(view.artisan.userId, {
    title: "📞 Demande de rappel",
    body: `${who} souhaite être rappelé au ${national} (devis n° ${view.quoteNumber}).`,
    url,
    tag: `callback-${view.id}`,
  });
  void (async () => {
    const to = await artisanEmail(db, view.artisan.userId);
    if (!to) return;
    await sendEmail({
      to,
      subject: `📞 ${who} demande à être rappelé (devis n° ${view.quoteNumber})`,
      html: `
        <p><strong>${escapeHtml(who)}</strong> souhaite être rappelé au sujet du devis n° <strong>${escapeHtml(view.quoteNumber)}</strong>.</p>
        <p style="font-size:20px"><a href="tel:${escapeHtml(phone)}"><strong>${escapeHtml(national)}</strong></a></p>
        ${emailButton(url, "Ouvrir la fiche client")}`,
      text: `${who} souhaite être rappelé au ${national} (devis n° ${view.quoteNumber}).`,
    });
  })().catch((e) => console.error("[devis] e-mail de rappel", quoteId, e));
  return { ok: true };
}

/** Conversation « invité » du client (sans compte) avec l'artisan : la retrouve ou la crée. */
async function guestConversationId(db: Db, view: QuoteResponseView): Promise<string | null> {
  // Client avec compte : il écrit depuis son espace (conversation liée à son compte).
  if (view.customerUserId || !view.clientId) return null;
  const { data: existing } = await db
    .from("conversations")
    .select("id")
    .eq("artisan_id", view.artisanId)
    .eq("client_id", view.clientId)
    .is("customer_user_id", null)
    .is("lead_id", null)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: created } = await db
    .from("conversations")
    .insert({ artisan_id: view.artisanId, client_id: view.clientId })
    .select("id")
    .single();
  return (created?.id as string | undefined) ?? null;
}

export type GuestThreadMessage = { id: string; fromClient: boolean; body: string; createdAt: string };

export async function loadGuestThread(db: Db, view: QuoteResponseView): Promise<GuestThreadMessage[]> {
  let convId: string | null = null;
  if (!view.customerUserId && view.clientId) {
    const { data } = await db
      .from("conversations")
      .select("id")
      .eq("artisan_id", view.artisanId)
      .eq("client_id", view.clientId)
      .is("customer_user_id", null)
      .is("lead_id", null)
      .maybeSingle();
    convId = (data?.id as string | undefined) ?? null;
  }
  if (!convId) return [];
  const { data } = await db
    .from("messages")
    .select("id, sender_user_id, kind, body, created_at")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: false })
    .limit(30);
  return (data ?? [])
    .filter((m) => m.kind !== "lead_recap")
    .reverse()
    .map((m) => ({
      id: m.id as string,
      fromClient: m.sender_user_id !== view.artisan.userId,
      body: m.body as string,
      createdAt: m.created_at as string,
    }));
}

export async function postGuestMessage(db: Db, quoteId: string, rawBody: string): Promise<ResponseResult> {
  const body = rawBody.trim();
  if (body.length < 2 || body.length > 2000) return { ok: false, error: "invalid_input" };

  const view = await loadQuoteForResponse(db, quoteId);
  if (!view) return { ok: false, error: "not_found" };
  const convId = await guestConversationId(db, view);
  if (!convId) return { ok: false, error: "not_found" };

  // Anti-abus : 10 messages invités par heure et par conversation.
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", convId)
    .eq("kind", "guest")
    .gte("created_at", since);
  if ((count ?? 0) >= 10) return { ok: false, error: "rate_limited" };

  const { error } = await db.from("messages").insert({ conversation_id: convId, sender_user_id: null, kind: "guest", body });
  if (error) return { ok: false, error: "not_found" };

  const who = view.customerName?.trim() || "Votre client";
  notifyUserActivity(view.artisan.userId, {
    title: `💬 ${who}`,
    body: body.length > 120 ? `${body.slice(0, 117)}…` : body,
    url: `${getPublicSiteUrl()}/app/messages/${convId}`,
    tag: `msg-${convId}`,
  });
  void (async () => {
    const to = await artisanEmail(db, view.artisan.userId);
    if (!to) return;
    await sendEmail({
      to,
      subject: `💬 Message de ${who} (devis n° ${view.quoteNumber})`,
      html: `<p><strong>${escapeHtml(who)}</strong> vous a écrit au sujet du devis n° ${escapeHtml(view.quoteNumber)} :</p>
        <blockquote style="border-left:3px solid #e2e8f0;margin:0;padding:4px 12px;color:#334155">${escapeHtml(body).replace(/\n/g, "<br/>")}</blockquote>
        ${emailButton(`${getPublicSiteUrl()}/app/messages/${convId}`, "Répondre")}`,
      text: `${who} : ${body}`,
    });
  })().catch((e) => console.error("[devis] e-mail message invité", quoteId, e));
  return { ok: true };
}

/**
 * L'artisan répond dans une conversation « invité » (client sans compte) :
 * le client reçoit la réponse par e-mail, avec le lien vers sa page devis
 * où il peut répondre à son tour.
 */
export async function forwardArtisanReplyToGuest(db: Db, conversationId: string, body: string): Promise<void> {
  const { data: conv } = await db
    .from("conversations")
    .select("id, artisan_id, customer_user_id, lead_id, client_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv || conv.customer_user_id || conv.lead_id || !conv.client_id) return;

  const [{ data: client }, { data: artisan }, { data: quote }] = await Promise.all([
    db.from("clients").select("email, display_name").eq("id", conv.client_id).maybeSingle(),
    db.from("profiles").select("business_name, user_id").eq("id", conv.artisan_id).maybeSingle(),
    db
      .from("quotes")
      .select("id")
      .eq("client_id", conv.client_id)
      .neq("status", "draft")
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!client?.email) return;
  const from = (artisan?.business_name as string) || "Votre artisan";
  // Réponse directe par e-mail possible : elle arrive dans la boîte de l'artisan.
  const replyTo = artisan?.user_id ? await artisanEmail(db, artisan.user_id as string) : null;
  const link = quote?.id ? quoteResponseUrl(quote.id as string) : null;
  const res = await sendEmail({
    to: client.email as string,
    replyTo: replyTo ?? undefined,
    subject: `Message de ${from}`,
    html: `<p>Bonjour ${escapeHtml((client.display_name as string) || "")},</p>
      <p><strong>${escapeHtml(from)}</strong> vous a écrit :</p>
      <blockquote style="border-left:3px solid #e2e8f0;margin:0;padding:4px 12px;color:#334155">${escapeHtml(body).replace(/\n/g, "<br/>")}</blockquote>
      ${link ? emailButton(link, "Répondre") : "<p>Vous pouvez répondre directement à cet e-mail.</p>"}`,
    text: `${from} : ${body}${link ? `\nRépondre : ${link}` : ""}`,
  });
  if (!res.ok) console.error("[messages] relais e-mail invité", conversationId, res.error);
}

/**
 * Acceptation depuis l'espace client (RPC client_accept_quote) : on complète la
 * preuve (empreinte, IP, navigateur) et on envoie les mêmes confirmations que
 * pour le lien e-mail — un seul comportement, quel que soit le canal.
 */
export async function completeAccountAcceptance(
  db: Db,
  quoteId: string,
  input: { signerName: string; ip: string | null; userAgent: string | null; vatCertified?: boolean },
): Promise<void> {
  const hash = await computeHash(db, quoteId);
  const certify = Boolean(input.vatCertified) && (await quoteRequiresVatCertification(db, quoteId));
  await db
    .from("quotes")
    .update({
      signed_document_hash: hash,
      signed_ip: input.ip?.slice(0, 64) ?? null,
      signed_user_agent: input.userAgent?.slice(0, 400) ?? null,
      response_channel: "account",
      ...(certify ? { vat_certified_at: new Date().toISOString() } : {}),
    })
    .eq("id", quoteId)
    .eq("status", "accepted");
  const view = await loadQuoteForResponse(db, quoteId);
  if (view) await sendAcceptanceEmails(db, view, input.signerName);
}

/**
 * Accord enregistré par l'artisan (devis signé sur papier au chantier, ou accord
 * oral / téléphonique). Le devis passe « accepté » et devient facturable.
 */
export async function recordArtisanAcceptance(
  db: Db,
  quoteId: string,
  artisanId: string,
  input: { signerName: string; channel: "artisan_paper" | "artisan_oral"; signedOn: string | null; scanPath: string | null },
): Promise<ResponseResult> {
  const name = input.signerName.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) return { ok: false, error: "invalid_name" };
  let signedAt = new Date();
  if (input.signedOn && /^\d{4}-\d{2}-\d{2}$/.test(input.signedOn)) {
    const d = new Date(`${input.signedOn}T12:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.getTime() <= Date.now() + 86_400_000) signedAt = d;
  }
  if (input.scanPath && !input.scanPath.startsWith(`${artisanId}/${quoteId}/`)) return { ok: false, error: "invalid_input" };

  const hash = await computeHash(db, quoteId);
  // Papier signé : le devis imprimé porte la certification, la signature la vaut.
  // Accord oral : aucune certification écrite → elle devra figurer sur la facture.
  const certify = input.channel === "artisan_paper" && (await quoteRequiresVatCertification(db, quoteId));
  const { data } = await db
    .from("quotes")
    .update({
      status: "accepted",
      signed_at: signedAt.toISOString(),
      signed_by_name: name,
      signed_document_hash: hash,
      response_channel: input.channel,
      signed_scan_path: input.scanPath,
      vat_certified_at: certify ? signedAt.toISOString() : null,
      rejected_at: null,
    })
    .eq("id", quoteId)
    .eq("artisan_id", artisanId)
    .eq("status", "sent")
    .select("id");
  return data?.length ? { ok: true } : { ok: false, error: "not_acceptable" };
}
