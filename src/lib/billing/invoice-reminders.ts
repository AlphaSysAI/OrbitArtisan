import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendEmail } from "@/lib/email/send-email";
import { getPublicSiteUrl } from "@/lib/site-url";

const REMINDER_SCHEDULE_DAYS = [7, 14, 21, 30] as const;

function formatEur(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function formatDateFr(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(date));
}

export type ReminderRunResult = {
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
    .not("due_date", "is", null)
    .lt("due_date", today);

  for (const inv of overdueCandidates ?? []) {
    const { error } = await supabase.from("invoices").update({ status: "overdue" }).eq("id", inv.id);
    if (!error) result.markedOverdue++;
  }

  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      "id, artisan_id, invoice_number, grand_total, due_date, customer_email, customer_name, reminder_count, last_reminder_at, status",
    )
    .in("status", ["sent", "overdue"])
    .not("due_date", "is", null)
    .not("customer_email", "is", null);

  for (const inv of invoices ?? []) {
    result.processed++;
    if (!inv.due_date || !inv.customer_email) continue;

    const { data: profile } = await supabase
      .from("profiles")
      .select("business_name, auto_reminder_enabled")
      .eq("id", inv.artisan_id)
      .maybeSingle();

    if (profile?.auto_reminder_enabled === false) continue;

    const dueDate = new Date(inv.due_date);
    const daysOverdue = Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysOverdue < REMINDER_SCHEDULE_DAYS[0]) continue;

    const level = REMINDER_SCHEDULE_DAYS.filter((d) => daysOverdue >= d).length;
    if (level <= (inv.reminder_count ?? 0)) continue;

    const subject =
      level >= 3
        ? `Dernière relance — facture ${inv.invoice_number ?? ""} en retard`
        : `Relance — facture ${inv.invoice_number ?? ""} à régler`;

    const bodyHtml = `
      <p>Bonjour${inv.customer_name ? ` ${inv.customer_name}` : ""},</p>
      <p>Nous vous rappelons que la facture <strong>${inv.invoice_number ?? ""}</strong>
      d'un montant de <strong>${formatEur(inv.grand_total ?? 0)}</strong>
      était due le <strong>${formatDateFr(inv.due_date)}</strong>.</p>
      <p>Merci de procéder au règlement dans les meilleurs délais.</p>
      <p>Cordialement,<br/>${profile?.business_name ?? "Votre artisan"}</p>
    `;

    const emailResult = await sendEmail({
      to: inv.customer_email,
      subject,
      html: bodyHtml,
      text: `Relance facture ${inv.invoice_number} — ${formatEur(inv.grand_total ?? 0)} — échéance ${formatDateFr(inv.due_date)}`,
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
        status: "overdue",
      })
      .eq("id", inv.id);

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
    .select("id, invoice_number, grand_total, due_date, customer_email, customer_name, reminder_count, status")
    .eq("id", invoiceId)
    .eq("artisan_id", artisanId)
    .maybeSingle();

  if (!inv) return { ok: false, error: "not_found" };
  if (!inv.customer_email) return { ok: false, error: "no_email" };
  if (!["sent", "overdue"].includes(inv.status)) return { ok: false, error: "invalid_status" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("business_name")
    .eq("id", artisanId)
    .maybeSingle();

  const subject = `Relance — facture ${inv.invoice_number ?? ""}`;
  const bodyHtml = `
    <p>Bonjour${inv.customer_name ? ` ${inv.customer_name}` : ""},</p>
    <p>Rappel concernant la facture <strong>${inv.invoice_number ?? ""}</strong>
    (${formatEur(inv.grand_total ?? 0)}${inv.due_date ? `, échéance ${formatDateFr(inv.due_date)}` : ""}).</p>
    <p>Cordialement,<br/>${profile?.business_name ?? "Votre artisan"}</p>
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
    .update({ reminder_count: level, last_reminder_at: new Date().toISOString(), status: "overdue" })
    .eq("id", invoiceId);

  return { ok: true };
}
