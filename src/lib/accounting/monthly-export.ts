import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ACCOUNTING_UPLOAD_RETENTION_DAYS,
  ACCOUNTING_UPLOADS_BUCKET,
  accountingActionForDay,
  batchBySize,
  nextSendLabel,
  parisDay,
  periodKey,
  periodLabel,
  previousPeriodKey,
  sanitizeAccountingFilename,
} from "@/lib/accounting/export-schedule";
import { buildInvoicesCsv, type InvoiceCsvRow } from "@/lib/accounting/invoices-csv";
import { artisanRecapMessage, buildMonthlyRecap, recapCsv, recapHtml } from "@/lib/accounting/monthly-recap";
import { ACCOUNTING_EXPORT_PAGE_PATH, listPendingPieces } from "@/lib/accounting/pending-pieces";
import { loadFacturXDocumentFromDb, renderInvoicePdf } from "@/lib/billing/facturx";
import { generateFacturX } from "@/lib/billing/facturx/generate-factur-x";
import { escapeHtml } from "@/lib/email/html";
import { sendEmail, type EmailAttachment } from "@/lib/email/send-email";
import { notifyUserActivity } from "@/lib/notifications/send-push";
import { getPublicSiteUrl } from "@/lib/site-url";

type Db = SupabaseClient;

type ExportProfile = {
  id: string;
  user_id: string;
  business_name: string | null;
  accountant_email: string | null;
  accountant_email_confirmed_at: string | null;
};



async function artisanEmail(db: Db, userId: string): Promise<string | null> {
  const { data } = await db.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

async function ensureExportRow(db: Db, profileId: string, period: string) {
  await db
    .from("accounting_exports")
    .upsert({ artisan_id: profileId, period_start: period }, { onConflict: "artisan_id,period_start", ignoreDuplicates: true });
  const { data } = await db
    .from("accounting_exports")
    .select("id, status, notice_sent_at")
    .eq("artisan_id", profileId)
    .eq("period_start", period)
    .maybeSingle();
  return data as { id: string; status: string; notice_sent_at: string | null } | null;
}

/** Préavis J-2 : push + e-mail à l'artisan avec le bouton « Ajouter des pièces ». */
async function sendNotice(db: Db, profile: ExportProfile, period: string, now: Date): Promise<void> {
  const url = `${getPublicSiteUrl()}${ACCOUNTING_EXPORT_PAGE_PATH}`;
  const when = nextSendLabel(now);
  const monthLabel = periodLabel(period);

  if (!profile.accountant_email_confirmed_at) {
    notifyUserActivity(profile.user_id, {
      title: "Envoi comptable bloqué",
      body: `Votre comptable (${profile.accountant_email}) n'a pas encore accepté les envois : rien ne partira ${when}. Renvoyez-lui le lien.`,
      url,
      tag: `accounting-notice-${period}`,
    });
    await db
      .from("accounting_exports")
      .update({ notice_sent_at: now.toISOString() })
      .eq("artisan_id", profile.id)
      .eq("period_start", period);
    return;
  }

  notifyUserActivity(profile.user_id, {
    title: "Envoi comptable dans 48 h",
    body: `J'envoie les factures de ${monthLabel} à votre comptable ${when}. D'autres pièces à lui transmettre ?`,
    url,
    tag: `accounting-notice-${period}`,
  });

  const email = await artisanEmail(db, profile.user_id);
  if (email) {
    const html = `
      <p>Bonjour,</p>
      <p>Je vais procéder à l'envoi comptable de <strong>${escapeHtml(monthLabel)}</strong> dans 48 h (${escapeHtml(when)}),
      à <strong>${escapeHtml(profile.accountant_email ?? "")}</strong>.</p>
      <p>Avez-vous d'autres éléments à lui transmettre (factures d'achat, tickets CB…) ?</p>
      <p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#f97316;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Ajouter des pièces</a></p>
      <p style="color:#64748b;font-size:13px">Les pièces ajoutées sont envoyées avec vos factures puis supprimées : Soline n'en garde aucune copie.</p>
      <p>Soline</p>`;
    const res = await sendEmail({
      to: email,
      subject: `Envoi comptable de ${monthLabel} dans 48 h — d'autres pièces à ajouter ?`,
      html,
      text: `Je vais procéder à l'envoi comptable de ${monthLabel} dans 48 h (${when}). Avez-vous d'autres éléments à transmettre ? Ajoutez-les ici : ${url}`,
    });
    if (!res.ok) console.error("[accounting] e-mail de préavis", profile.id, res.error);
  }

  await db
    .from("accounting_exports")
    .update({ notice_sent_at: now.toISOString() })
    .eq("artisan_id", profile.id)
    .eq("period_start", period);
}

async function renderInvoiceAttachment(db: Db, invoiceId: string, invoiceNumber: string | null) {
  const document = await loadFacturXDocumentFromDb(db, invoiceId);
  if (!document || document.lines.length === 0) return null;
  const base = sanitizeAccountingFilename(document.invoiceNumber || invoiceNumber || invoiceId);
  try {
    // Factur-X (PDF/A-3 + XML) : directement importable par les logiciels comptables.
    const { pdf } = await generateFacturX(document, { profile: "en16931" });
    return { filename: `facture-${base}.pdf`, bytes: Buffer.from(pdf) };
  } catch (error) {
    console.warn("[accounting] Factur-X indisponible, PDF simple", invoiceId, error instanceof Error ? error.message : error);
    const pdf = await renderInvoicePdf(document);
    return { filename: `facture-${base}.pdf`, bytes: Buffer.from(pdf) };
  }
}

export type SendExportResult =
  | { ok: true; status: "sent" | "skipped"; invoiceCount: number; attachmentCount: number; parts: number }
  | { ok: false; error: string };

/**
 * Envoie au comptable les factures émises depuis le dernier envoi (Factur-X + CSV)
 * et les pièces ajoutées, découpées en plusieurs e-mails si besoin. Les pièces
 * ajoutées sont supprimées après envoi réussi uniquement (en cas d'échec, elles
 * restent pour la nouvelle tentative).
 */
export async function sendAccountingExport(
  db: Db,
  profile: ExportProfile,
  period: string,
  now: Date = new Date(),
): Promise<SendExportResult> {
  const recipient = profile.accountant_email?.trim();
  if (!recipient) return { ok: false, error: "no_accountant_email" };
  // Double confirmation : jamais d'envoi à une adresse qui n'a pas accepté.
  if (!profile.accountant_email_confirmed_at) return { ok: false, error: "accountant_not_confirmed" };

  // Reprise exacte après le dernier envoi réussi : aucune facture oubliée ni doublée.
  const { data: lastSent } = await db
    .from("accounting_exports")
    .select("cutoff_at")
    .eq("artisan_id", profile.id)
    .eq("status", "sent")
    .not("cutoff_at", "is", null)
    .order("cutoff_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const cutoff = now.toISOString();
  const from = (lastSent?.cutoff_at as string | undefined) ?? `${period}T00:00:00+00:00`;

  const { data: invoiceRows, error: invoiceError } = await db
    .from("invoices")
    .select(
      "id, invoice_number, invoice_type, status, finalized_at, due_date, customer_name, customer_email, grand_total, labor_total, materials_total, payment_received_at",
    )
    .eq("artisan_id", profile.id)
    .not("finalized_at", "is", null)
    .gt("finalized_at", from)
    .lte("finalized_at", cutoff)
    .order("finalized_at", { ascending: true });
  if (invoiceError) return { ok: false, error: `invoices:${invoiceError.message}` };

  const invoices = (invoiceRows ?? []) as (InvoiceCsvRow & { id: string })[];
  const pieces = await listPendingPieces(db, profile.id);
  const monthLabel = periodLabel(period);
  const business = profile.business_name?.trim() || "Entreprise";

  if (invoices.length === 0 && pieces.length === 0) {
    await db
      .from("accounting_exports")
      .update({ status: "skipped", sent_at: now.toISOString(), cutoff_at: cutoff, recipient_email: recipient, error_message: null })
      .eq("artisan_id", profile.id)
      .eq("period_start", period);
    notifyUserActivity(profile.user_id, {
      title: "Envoi comptable",
      body: `Aucune facture ni pièce pour ${monthLabel} : rien n'a été envoyé à votre comptable.`,
      url: `${getPublicSiteUrl()}${ACCOUNTING_EXPORT_PAGE_PATH}`,
      tag: `accounting-sent-${period}`,
    });
    return { ok: true, status: "skipped", invoiceCount: 0, attachmentCount: 0, parts: 0 };
  }

  // Synthèse chiffrée (TVA ventilée comme dans les XML Factur-X, relances du mois).
  const invoiceIds = invoices.map((i) => i.id);
  const [{ data: lineRows }, { count: remindersSent }] = await Promise.all([
    invoiceIds.length
      ? db.from("invoice_lines").select("invoice_id, line_total, vat_rate, vat_category_code").in("invoice_id", invoiceIds)
      : Promise.resolve({ data: [] as { invoice_id: string; line_total: number; vat_rate: number | null; vat_category_code: string | null }[] }),
    db
      .from("invoice_reminders")
      .select("id", { count: "exact", head: true })
      .eq("artisan_id", profile.id)
      .gte("created_at", `${period}T00:00:00+00:00`)
      .lte("created_at", cutoff),
  ]);
  const todayIso = `${String(parisDay(now).year)}-${String(parisDay(now).month).padStart(2, "0")}-${String(parisDay(now).day).padStart(2, "0")}`;
  const recap = buildMonthlyRecap({
    invoices: invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      invoiceType: inv.invoice_type,
      status: inv.status,
      dueDate: inv.due_date,
      paymentReceivedAt: inv.payment_received_at ?? null,
      lines: (lineRows ?? [])
        .filter((l) => l.invoice_id === inv.id)
        .map((l) => ({ lineTotalCents: l.line_total as number, vatRate: (l.vat_rate as number | null) ?? 20, vatCategoryCode: l.vat_category_code as string | null })),
    })),
    remindersSent: remindersSent ?? 0,
    piecesCount: pieces.length,
    today: todayIso,
  });

  type Item = { filename: string; bytes: Buffer; size: number };
  const items: Item[] = [];
  const csv = Buffer.from(buildInvoicesCsv(invoices), "utf8");
  items.push({ filename: `recap-factures-${period.slice(0, 7)}.csv`, bytes: csv, size: csv.length });
  const synth = Buffer.from(recapCsv(recap, monthLabel), "utf8");
  items.push({ filename: `synthese-tva-${period.slice(0, 7)}.csv`, bytes: synth, size: synth.length });

  for (const inv of invoices) {
    try {
      const att = await renderInvoiceAttachment(db, inv.id, inv.invoice_number);
      if (att) items.push({ ...att, size: att.bytes.length });
    } catch (error) {
      return { ok: false, error: `pdf:${inv.invoice_number ?? inv.id}:${error instanceof Error ? error.message : error}` };
    }
  }

  for (const piece of pieces) {
    const { data: blob, error } = await db.storage.from(ACCOUNTING_UPLOADS_BUCKET).download(piece.path);
    if (error || !blob) return { ok: false, error: `download:${piece.name}` };
    const bytes = Buffer.from(await blob.arrayBuffer());
    items.push({ filename: `piece-${sanitizeAccountingFilename(piece.name)}`, bytes, size: bytes.length });
  }

  const artisan = await artisanEmail(db, profile.user_id);
  const batches = batchBySize(items);
  const pieceNames = pieces.map((p) => `<li>${escapeHtml(p.name)}</li>`).join("");

  for (let i = 0; i < batches.length; i++) {
    const partSuffix = batches.length > 1 ? ` (${i + 1}/${batches.length})` : "";
    const html = `
      <p>Bonjour,</p>
      <p>Voici les documents comptables de <strong>${escapeHtml(business)}</strong> pour <strong>${escapeHtml(monthLabel)}</strong>${escapeHtml(partSuffix)}.</p>
      <ul>
        <li>${invoices.length} facture${invoices.length > 1 ? "s" : ""} émise${invoices.length > 1 ? "s" : ""} (PDF Factur-X) et leur récapitulatif CSV</li>
        ${pieces.length ? `<li>${pieces.length} pièce${pieces.length > 1 ? "s" : ""} transmise${pieces.length > 1 ? "s" : ""} par l'entreprise :<ul>${pieceNames}</ul></li>` : ""}
      </ul>
      ${i === 0 && invoices.length ? recapHtml(recap) : ""}
      ${batches.length > 1 ? `<p>Les pièces jointes sont réparties sur ${batches.length} e-mails.</p>` : ""}
      <p>Pour toute question, répondez directement à cet e-mail : votre réponse parviendra à ${escapeHtml(business)}.</p>
      <p>Envoyé par Soline pour ${escapeHtml(business)}</p>`;
    const attachments: EmailAttachment[] = batches[i].map((it) => ({
      filename: it.filename,
      content: it.bytes.toString("base64"),
    }));
    const res = await sendEmail({
      to: recipient,
      cc: artisan ? [artisan] : undefined,
      replyTo: artisan ?? undefined,
      subject: `${business} — documents comptables ${monthLabel}${partSuffix}`,
      html,
      attachments,
    });
    if (!res.ok) return { ok: false, error: `email_part_${i + 1}:${res.error}` };
  }

  // Envoi réussi : suppression des pièces ajoutées (aucune copie conservée).
  if (pieces.length) {
    const { error: removeError } = await db.storage.from(ACCOUNTING_UPLOADS_BUCKET).remove(pieces.map((p) => p.path));
    if (removeError) console.error("[accounting] suppression des pièces après envoi", profile.id, removeError.message);
  }

  await db
    .from("accounting_exports")
    .update({
      status: "sent",
      sent_at: now.toISOString(),
      cutoff_at: cutoff,
      recipient_email: recipient,
      invoice_count: invoices.length,
      attachment_count: pieces.length,
      email_parts: batches.length,
      error_message: null,
      recap,
    })
    .eq("artisan_id", profile.id)
    .eq("period_start", period);

  notifyUserActivity(profile.user_id, {
    title: "✅ Dossier comptable transmis",
    body: artisanRecapMessage(recap, monthLabel),
    url: `${getPublicSiteUrl()}${ACCOUNTING_EXPORT_PAGE_PATH}`,
    tag: `accounting-sent-${period}`,
  });

  return { ok: true, status: "sent", invoiceCount: invoices.length, attachmentCount: pieces.length, parts: batches.length };
}

async function markFailed(db: Db, profile: ExportProfile, period: string, error: string, notify = true) {
  await db
    .from("accounting_exports")
    .update({ status: "failed", error_message: error.slice(0, 500) })
    .eq("artisan_id", profile.id)
    .eq("period_start", period);
  if (!notify) return;
  notifyUserActivity(profile.user_id, {
    title: "Envoi comptable non effectué",
    body:
      error === "accountant_not_confirmed"
        ? "Votre comptable n'a pas encore accepté les envois. Dès qu'il accepte, l'envoi part au passage suivant."
        : "Un incident a empêché l'envoi à votre comptable. Nouvelle tentative automatique demain.",
    url: `${getPublicSiteUrl()}${ACCOUNTING_EXPORT_PAGE_PATH}`,
    tag: `accounting-failed-${period}`,
  });
}

export type AccountingRunResult = { notices: number; sent: number; skipped: number; failed: number; purged: number };

/**
 * Cron quotidien (soir, heure de Paris) :
 * - J-2 du dernier jour : préavis ;
 * - dernier jour : envoi du mois ;
 * - rattrapage : un mois précédent non envoyé (cron manqué, échec) part le lendemain.
 * Budget de temps : on s'arrête avant la limite d'exécution, le reste part au passage suivant.
 */
export async function runAccountingExports(
  db: Db,
  now: Date = new Date(),
  budgetMs = 50_000,
): Promise<AccountingRunResult> {
  const started = Date.now();
  const result: AccountingRunResult = { notices: 0, sent: 0, skipped: 0, failed: 0, purged: 0 };
  const today = parisDay(now);
  const action = accountingActionForDay(today);
  const currentPeriod = periodKey(today.year, today.month);
  const previousPeriod = previousPeriodKey(today.year, today.month);

  const { data: profiles, error } = await db
    .from("profiles")
    .select("id, user_id, business_name, accountant_email, accountant_email_confirmed_at")
    .eq("accounting_export_enabled", true)
    .not("accountant_email", "is", null);
  if (error) {
    console.error("[accounting] lecture des profils", error.message);
    return result;
  }

  for (const profile of (profiles ?? []) as ExportProfile[]) {
    if (Date.now() - started > budgetMs) break;

    // Rattrapage du mois précédent (uniquement s'il avait été préparé).
    const { data: prev } = await db
      .from("accounting_exports")
      .select("status")
      .eq("artisan_id", profile.id)
      .eq("period_start", previousPeriod)
      .maybeSingle();
    if (prev && (prev.status === "scheduled" || prev.status === "failed")) {
      const res = await sendAccountingExport(db, profile, previousPeriod, now);
      if (res.ok) {
        if (res.status === "sent") result.sent++;
        else result.skipped++;
      } else {
        result.failed++;
        // Rattrapage quotidien : pas de relance push chaque jour pour un comptable non confirmé.
        await markFailed(db, profile, previousPeriod, res.error, res.error !== "accountant_not_confirmed");
      }
    }

    if (!action) continue;
    const row = await ensureExportRow(db, profile.id, currentPeriod);
    if (!row) continue;

    if (action === "notice" && !row.notice_sent_at) {
      await sendNotice(db, profile, currentPeriod, now);
      result.notices++;
    }

    if (action === "send" && (row.status === "scheduled" || row.status === "failed")) {
      const res = await sendAccountingExport(db, profile, currentPeriod, now);
      if (res.ok) {
        if (res.status === "sent") result.sent++;
        else result.skipped++;
      } else {
        result.failed++;
        await markFailed(db, profile, currentPeriod, res.error);
      }
    }
  }

  result.purged = await purgeStaleUploads(db, now);
  return result;
}

/** Pièces jamais envoyées (envoi désactivé entre-temps) : supprimées au-delà de 45 jours. */
async function purgeStaleUploads(db: Db, now: Date): Promise<number> {
  const limit = now.getTime() - ACCOUNTING_UPLOAD_RETENTION_DAYS * 86_400_000;
  const { data: folders } = await db.storage.from(ACCOUNTING_UPLOADS_BUCKET).list("", { limit: 1000 });
  let purged = 0;
  for (const folder of folders ?? []) {
    if (folder.id) continue; // fichier à la racine : ignoré
    const { data: files } = await db.storage.from(ACCOUNTING_UPLOADS_BUCKET).list(folder.name, { limit: 100 });
    const stale = (files ?? [])
      .filter((f) => f.id && new Date(f.created_at ?? now.toISOString()).getTime() < limit)
      .map((f) => `${folder.name}/${f.name}`);
    if (stale.length) {
      const { error } = await db.storage.from(ACCOUNTING_UPLOADS_BUCKET).remove(stale);
      if (!error) purged += stale.length;
    }
  }
  return purged;
}
