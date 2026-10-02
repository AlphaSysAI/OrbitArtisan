import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { VISIT_TIMEZONE } from "@/lib/appointments/visit-hours";
import { trackingPath } from "@/lib/appointments/tracking-link";
import { escapeHtml } from "@/lib/email/html";
import { sendEmail } from "@/lib/email/send-email";
import { getPublicSiteUrl } from "@/lib/site-url";

type Db = SupabaseClient;

type CustomerAppointmentView = {
  id: string;
  status: "pending" | "confirmed" | "cancelled";
  startTime: string;
  customerName: string;
  customerEmail: string | null;
  customerUserId: string | null;
  source: string | null;
  artisanId: string;
  artisanName: string;
  artisanPhone: string | null;
  artisanSlug: string | null;
  serviceTitle: string | null;
};

/** Charge un RDV et les infos publiques de l'artisan (service role, usage serveur uniquement). */
export async function loadCustomerAppointment(db: Db, appointmentId: string): Promise<CustomerAppointmentView | null> {
  const { data: appt } = await db
    .from("appointments")
    .select("id, status, start_time, customer_name, customer_email, customer_user_id, source, artisan_id, service_id")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return null;

  const [{ data: artisan }, { data: service }] = await Promise.all([
    db.from("artisan_public_profiles").select("business_name, phone, slug").eq("id", appt.artisan_id).maybeSingle(),
    appt.service_id
      ? db.from("services").select("title").eq("id", appt.service_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    id: appt.id as string,
    status: appt.status as CustomerAppointmentView["status"],
    startTime: appt.start_time as string,
    customerName: (appt.customer_name as string) ?? "",
    customerEmail: (appt.customer_email as string | null) ?? null,
    customerUserId: (appt.customer_user_id as string | null) ?? null,
    source: (appt.source as string | null) ?? null,
    artisanId: appt.artisan_id as string,
    artisanName: (artisan?.business_name as string | undefined)?.trim() || "Votre artisan",
    artisanPhone: (artisan?.phone as string | null | undefined) ?? null,
    artisanSlug: (artisan?.slug as string | null | undefined) ?? null,
    serviceTitle: (service?.title as string | null | undefined) ?? null,
  };
}

export function formatAppointmentWhen(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: VISIT_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}


function button(url: string, label: string): string {
  return `<p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#f97316;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(label)}</a></p>`;
}

/** Lien du client : suivi signé s'il n'a pas de compte, espace client sinon. */
function customerLink(appt: CustomerAppointmentView): { url: string; label: string } {
  const base = getPublicSiteUrl();
  return appt.customerUserId
    ? { url: `${base}/compte`, label: "Voir dans mon espace" }
    : { url: `${base}${trackingPath(appt.id)}`, label: "Suivre ma demande" };
}

/** Accusé de réception d'une demande faite depuis la vitrine. */
export async function sendBookingReceiptEmail(db: Db, appointmentId: string): Promise<void> {
  const appt = await loadCustomerAppointment(db, appointmentId);
  if (!appt?.customerEmail) return;
  const when = formatAppointmentWhen(appt.startTime);
  const link = customerLink(appt);
  const service = appt.serviceTitle ? ` (${escapeHtml(appt.serviceTitle)})` : "";
  const res = await sendEmail({
    to: appt.customerEmail,
    subject: `Demande de rendez-vous envoyée à ${appt.artisanName}`,
    html: `
      <p>Bonjour ${escapeHtml(appt.customerName)},</p>
      <p>Votre demande de rendez-vous du <strong>${escapeHtml(when)}</strong>${service} a bien été transmise à <strong>${escapeHtml(appt.artisanName)}</strong>.</p>
      <p>Le créneau vous est réservé en attendant sa confirmation. Vous recevrez un e-mail dès qu'il l'aura validé.</p>
      ${button(link.url, link.label)}
      <p style="color:#64748b;font-size:13px">Depuis ce lien, vous pouvez suivre ou annuler votre demande, et créer un compte pour échanger directement avec l'artisan.</p>
      <p>Soline</p>`,
    text: `Votre demande de rendez-vous du ${when} a été transmise à ${appt.artisanName}. Suivre ou annuler : ${link.url}`,
  });
  if (!res.ok) console.error("[rdv] e-mail d'accusé de réception", appointmentId, res.error);
}

/**
 * Confirmation ou refus par l'artisan, pour un RDV pris depuis la vitrine
 * (les RDV Soline sont confirmés par SMS, ceux saisis par l'artisan ne notifient pas).
 */
export async function sendAppointmentDecisionEmail(
  db: Db,
  appointmentId: string,
  decision: "confirmed" | "cancelled",
): Promise<void> {
  const appt = await loadCustomerAppointment(db, appointmentId);
  if (!appt?.customerEmail) return;
  if (appt.source === "voice" || appt.source === "artisan") return;

  const when = formatAppointmentWhen(appt.startTime);
  const link = customerLink(appt);
  const phone = appt.artisanPhone ? ` au ${escapeHtml(appt.artisanPhone)}` : "";
  const subject =
    decision === "confirmed"
      ? `Rendez-vous confirmé avec ${appt.artisanName} — ${when}`
      : `Rendez-vous non retenu par ${appt.artisanName}`;
  const body =
    decision === "confirmed"
      ? `<p><strong>${escapeHtml(appt.artisanName)}</strong> a confirmé votre rendez-vous du <strong>${escapeHtml(when)}</strong>.</p>
         <p>Un empêchement ? Prévenez-le${phone} ou annulez depuis le lien ci-dessous.</p>`
      : `<p><strong>${escapeHtml(appt.artisanName)}</strong> ne peut pas vous recevoir le ${escapeHtml(when)}.</p>
         <p>Vous pouvez choisir un autre créneau sur sa page${phone ? `, ou l'appeler${phone}` : ""}.</p>`;

  const res = await sendEmail({
    to: appt.customerEmail,
    subject,
    html: `<p>Bonjour ${escapeHtml(appt.customerName)},</p>${body}${button(link.url, link.label)}<p>Soline</p>`,
    text: `${subject}. ${link.url}`,
  });
  if (!res.ok) console.error("[rdv] e-mail de décision", appointmentId, res.error);
}
