import "server-only";

import { loadCollectibleAmount } from "@/lib/billing/invoice-collection";
import type { SupabaseClient } from "@supabase/supabase-js";

import { escapeHtml } from "@/lib/email/html";
import { sendEmail } from "@/lib/email/send-email";
import { getPublicSiteUrl } from "@/lib/site-url";
import { formatDateFr } from "@/lib/format/date";
import { formatCents } from "@/lib/format/money";
import { findSubscriptionPlan } from "@/lib/billing/subscription-plans";

/** Délai minimal entre deux relances manuelles d'une même facture. */
export const MANUAL_REMINDER_COOLDOWN_HOURS = 24;

const REMINDER_SCHEDULE_DAYS = [7, 14, 21, 30] as const;

type ReminderRunResult = {
  processed: number;
  sent: number;
  markedOverdue: number;
  errors: string[];
};

/** Marque les factures en retard et envoie les relances automatiques. */
export async function runInvoiceReminders(supabase: SupabaseClient): Promise<ReminderRunResult> {
  const result: ReminderRunResult = { processed: 0, sent: 0, markedOverdue: 0, errors: [] };
  const today = new Date().toISOString().slice(0, 10);

  const { data: overdueCandidates } = await supabase
    .from("invoices")
    .select("id, artisan_id, status, due_date")
    .eq("status", "sent")
    .neq("invoice_type", "credit_note")
    .not("finalized_at", "is", null)
    .not("due_date", "is", null)
    .lt("due_date", today);

  for (const inv of overdueCandidates ?? []) {
    const { error } = await supabase.from("invoices").update({ status: "overdue" }).eq("id", inv.id).eq("status", "sent");
    if (!error) result.markedOverdue++;
  }

  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      "id, artisan_id, invoice_number, grand_total, invoice_type, finalized_at, due_date, customer_email, customer_name, reminder_count, last_reminder_at, status",
    )
    .in("status", ["sent", "overdue"])
    .neq("invoice_type", "credit_note")
    .not("finalized_at", "is", null)
    .not("due_date", "is", null)
    .not("customer_email", "is", null);

  for (const inv of invoices ?? []) {
    result.processed++;
    if (!inv.due_date || !inv.customer_email) continue;

    const { data: profile } = await supabase
      .from("profiles")
      .select("business_name, auto_reminder_enabled, subscription_plan")
      .eq("id", inv.artisan_id)
      .maybeSingle();

    if (profile?.auto_reminder_enabled === false) continue;
    // Essentiel : relances manuelles uniquement (bouton « Relancer »).
    if (!findSubscriptionPlan(profile?.subscription_plan ?? "")?.autoInvoiceReminders) continue;

    const dueDate = new Date(inv.due_date);
    const daysOverdue = Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysOverdue < REMINDER_SCHEDULE_DAYS[0]) continue;

    const level = REMINDER_SCHEDULE_DAYS.filter((d) => daysOverdue >= d).length;
    if (level <= (inv.reminder_count ?? 0)) continue;

    const { data: current } = await supabase.from("invoices")
      .select("id, grand_total, invoice_type, finalized_at, status").eq("id", inv.id).maybeSingle();
    const amount = current ? await loadCollectibleAmount(supabase, current).catch(() => null) : null;
    if (amount === null) continue;

    const subject =
      level >= 3
        ? `Dernière relance — facture ${inv.invoice_number ?? ""} en retard`
        : `Relance — facture ${inv.invoice_number ?? ""} à régler`;

    const bodyHtml = `
      <p>Bonjour${inv.customer_name ? ` ${escapeHtml(inv.customer_name)}` : ""},</p>
      <p>Nous vous rappelons que la facture <strong>${escapeHtml(inv.invoice_number)}</strong>
      d'un montant de <strong>${formatCents(amount)}</strong>
      était due le <strong>${formatDateFr(inv.due_date, { dateStyle: "long" })}</strong>.</p>
      <p>Merci de procéder au règlement dans les meilleurs délais.</p>
      <p>Cordialement,<br/>${escapeHtml(profile?.business_name ?? "Votre artisan")}</p>
    `;

    const emailResult = await sendEmail({
      to: inv.customer_email,
      subject,
      html: bodyHtml,
      text: `Relance facture ${inv.invoice_number} — ${formatCents(amount)} — échéance ${formatDateFr(inv.due_date, { dateStyle: "long" })}`,
    });

    if (!emailResult.ok) {
      result.errors.push(`${inv.id}: ${emailResult.error}`);
      continue;
    }

    await supabase.from("invoice_reminders").insert({
      invoice_id: inv.id,
      artisan_id: inv.artisan_id,
      reminder_level: level,
      channel: "email",
      recipient_email: inv.customer_email,
      subject,
      body_preview: bodyHtml.slice(0, 500),
    });

    await supabase
      .from("invoices")
      .update({
        reminder_count: level,
        last_reminder_at: new Date().toISOString(),
      })
      .eq("id", inv.id).in("status", ["sent", "overdue"]);

    result.sent++;
  }

  return result;
}

export async function sendManualInvoiceReminder(
  supabase: SupabaseClient,
  invoiceId: string,
  artisanId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: inv } = await supabase
    .from("invoices")
    .select("id, invoice_number, grand_total, invoice_type, finalized_at, due_date, customer_email, customer_name, reminder_count, last_reminder_at, status")
    .eq("id", invoiceId)
    .eq("artisan_id", artisanId)
    .maybeSingle();

  if (!inv) return { ok: false, error: "not_found" };
  if (!inv.customer_email) return { ok: false, error: "no_email" };
  if (
    inv.last_reminder_at &&
    Date.now() - new Date(inv.last_reminder_at).getTime() < MANUAL_REMINDER_COOLDOWN_HOURS * 3_600_000
  ) {
    return { ok: false, error: "too_soon" };
  }
  const amount = await loadCollectibleAmount(supabase, inv).catch(() => null);
  if (amount === null) return { ok: false, error: "invalid_status" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("business_name")
    .eq("id", artisanId)
    .maybeSingle();

  const subject = `Relance — facture ${inv.invoice_number ?? ""}`;
  const bodyHtml = `
    <p>Bonjour${inv.customer_name ? ` ${escapeHtml(inv.customer_name)}` : ""},</p>
    <p>Rappel concernant la facture <strong>${escapeHtml(inv.invoice_number)}</strong>
    (${formatCents(amount)}${inv.due_date ? `, échéance ${formatDateFr(inv.due_date, { dateStyle: "long" })}` : ""}).</p>
    <p>Cordialement,<br/>${escapeHtml(profile?.business_name ?? "Votre artisan")}</p>
    <p><a href="${getPublicSiteUrl()}/compte/factures/${inv.id}">Voir la facture</a></p>
  `;

  const emailResult = await sendEmail({ to: inv.customer_email, subject, html: bodyHtml });
  if (!emailResult.ok) return { ok: false, error: emailResult.error };

  const level = (inv.reminder_count ?? 0) + 1;
  await supabase.from("invoice_reminders").insert({
    invoice_id: inv.id,
    artisan_id: artisanId,
    reminder_level: level,
    channel: "manual",
    recipient_email: inv.customer_email,
    subject,
    body_preview: bodyHtml.slice(0, 500),
  });

  await supabase
    .from("invoices")
    .update({ reminder_count: level, last_reminder_at: new Date().toISOString() })
    .eq("id", invoiceId).in("status", ["sent", "overdue"]);

  return { ok: true };
}
