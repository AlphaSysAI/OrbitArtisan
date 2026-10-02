"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAdminDb } from "@/lib/admin/db";
import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requirePlatformAdminSafe } from "@/lib/auth/platform-admin";
import { ensureConciergeInvite, interestedEmail, interestedSmsBody, optOutUrl } from "@/lib/concierge/concierge";
import { sendEmail } from "@/lib/email/send-email";
import { importProspects, PROSPECT_IMPORT_MAX_BYTES, type ImportResult } from "@/lib/concierge/import-prospects";
import type { AnonymizedLeadSummary } from "@/lib/concierge/summary";
import { sendTransactionalSms } from "@/lib/sms/send-sms";
import { isFrenchMobile } from "@/lib/phone";

type Fail = { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guardAdmin() {
  const res = await requirePlatformAdminSafe();
  if (!res.ok) {
    if (res.error === "auth") redirect("/login?next=/admin/conciergerie");
    redirect("/admin/forbidden");
  }
  const admin = getAdminDb();
  if (!admin) throw new Error("ADMIN_MISSING_SERVICE_ROLE");
  return { user: res.user, admin };
}

function refresh(prospectId?: string) {
  revalidatePath("/admin/conciergerie");
  revalidatePath("/admin/conciergerie/prospects");
  if (prospectId) revalidatePath(`/admin/conciergerie/prospects/${prospectId}`);
}

type Admin = Awaited<ReturnType<typeof guardAdmin>>["admin"];

async function loadContactable(admin: Admin, prospectId: string) {
  if (!UUID.test(prospectId)) return null;
  const { data } = await admin
    .from("prospect_artisans")
    .select("id, business_name, phone, email, status, opt_out, contact_count")
    .eq("id", prospectId)
    .maybeSingle();
  return data as {
    id: string;
    business_name: string;
    phone: string;
    email: string | null;
    status: string;
    opt_out: boolean;
    contact_count: number;
  } | null;
}

/** Trace l'appel : statut « contacted » (sauf converti), date et compteur. */
async function recordContact(admin: Admin, p: { id: string; status: string; contact_count: number }) {
  await admin
    .from("prospect_artisans")
    .update({
      status: p.status === "converted" ? "converted" : "contacted",
      last_contacted_at: new Date().toISOString(),
      contact_count: p.contact_count + 1,
    })
    .eq("id", p.id)
    .eq("opt_out", false);
}

// ---------------------------------------------------------------------------
// Import CSV / JSON
// ---------------------------------------------------------------------------
export async function importProspectsAction(formData: FormData): Promise<({ ok: true } & ImportResult) | Fail> {
  const { user, admin } = await guardAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Aucun fichier." };
  if (file.size > PROSPECT_IMPORT_MAX_BYTES) return { ok: false, error: "Fichier trop lourd (4 Mo max, découpez-le)." };
  const name = file.name.toLowerCase();
  const format = name.endsWith(".json")
    ? "json"
    : name.endsWith(".xlsx")
      ? "xlsx"
      : name.endsWith(".csv") || name.endsWith(".txt")
        ? "csv"
        : null;
  if (!format) return { ok: false, error: "Format attendu : .xlsx, .csv ou .json." };

  let result: ImportResult;
  try {
    const content = format === "xlsx" ? Buffer.from(await file.arrayBuffer()) : await file.text();
    result = await importProspects(admin, { content, format, source: file.name.slice(0, 120) });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Import impossible." };
  }
  await writeAdminAuditLog({
    adminUserId: user.id,
    action: "concierge.import",
    details: { file: file.name, total: result.total, inserted: result.inserted, rejected: result.rejected.length },
  });
  refresh();
  return { ok: true, ...result, rejected: result.rejected.slice(0, 200) };
}

// ---------------------------------------------------------------------------
// Alerte chantier
// ---------------------------------------------------------------------------
export async function generateInviteAction(input: { prospectId: string; alertId: string | null }): Promise<{ ok: true; url: string } | Fail> {
  const { user, admin } = await guardAdmin();
  const p = await loadContactable(admin, input.prospectId);
  if (!p || p.opt_out) return { ok: false, error: "Prospect introuvable ou désinscrit." };

  let leadId: string | null = null;
  if (input.alertId) {
    if (!UUID.test(input.alertId)) return { ok: false, error: "Alerte invalide." };
    const { data: alert } = await admin.from("concierge_alerts").select("lead_id").eq("id", input.alertId).maybeSingle();
    if (!alert) return { ok: false, error: "Alerte introuvable." };
    leadId = alert.lead_id as string;
  }
  const invite = await ensureConciergeInvite(admin, { prospectId: p.id, leadId, adminUserId: user.id });
  if (!invite) return { ok: false, error: "Création du lien impossible." };
  await writeAdminAuditLog({ adminUserId: user.id, action: "concierge.invite", details: { prospect_id: p.id, lead_id: leadId } });
  refresh(p.id);
  return { ok: true, url: invite.url };
}

export async function setAlertStatusAction(input: { alertId: string; status: "open" | "handled" | "dismissed" }): Promise<{ ok: true } | Fail> {
  const { user, admin } = await guardAdmin();
  if (!UUID.test(input.alertId) || !["open", "handled", "dismissed"].includes(input.status)) return { ok: false, error: "Requête invalide." };
  const { error } = await admin
    .from("concierge_alerts")
    .update({ status: input.status, handled_at: input.status === "open" ? null : new Date().toISOString() })
    .eq("id", input.alertId);
  if (error) return { ok: false, error: "Mise à jour impossible." };
  await writeAdminAuditLog({ adminUserId: user.id, action: `concierge.alert_${input.status}`, details: { alert_id: input.alertId } });
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 3 actions « au téléphone »
// ---------------------------------------------------------------------------

/**
 * « Intéressé » : SMS avec lien d'inscription pré-associé au chantier (l'alerte
 * passée en paramètre, sinon la plus récente encore ouverte qui le cite).
 * Le contact est tracé même si l'envoi SMS échoue : le lien est renvoyé pour
 * être transmis à la main.
 */
export async function markInterestedAction(input: {
  prospectId: string;
  alertId?: string | null;
}): Promise<{ ok: true; url: string; channel: "sms" | "email" | "none"; sent: boolean } | Fail> {
  const { user, admin } = await guardAdmin();
  const p = await loadContactable(admin, input.prospectId);
  if (!p || p.opt_out) return { ok: false, error: "Prospect introuvable ou désinscrit." };

  let alertQuery = admin.from("concierge_alerts").select("id, lead_id, summary").contains("prospect_ids", [p.id]);
  if (input.alertId && UUID.test(input.alertId)) alertQuery = alertQuery.eq("id", input.alertId);
  else alertQuery = alertQuery.eq("status", "open");
  const { data: alerts } = await alertQuery.order("created_at", { ascending: false }).limit(1);
  const alert = alerts?.[0] as { id: string; lead_id: string; summary: AnonymizedLeadSummary } | undefined;

  const invite = await ensureConciergeInvite(admin, { prospectId: p.id, leadId: alert?.lead_id ?? null, adminUserId: user.id });
  if (!invite) return { ok: false, error: "Création du lien impossible." };

  // Mobile → SMS. Ligne fixe → e-mail pro vérifié s'il existe (un SMS n'arriverait
  // jamais et serait facturé). Sinon, lien à transmettre à la main.
  const summary = alert?.summary ?? null;
  const channel: "sms" | "email" | "none" = isFrenchMobile(p.phone) ? "sms" : p.email ? "email" : "none";
  let sent = false;
  let failure: string | null = null;
  if (channel === "sms") {
    const sms = await sendTransactionalSms({
      to: p.phone,
      body: interestedSmsBody({ summary, inviteUrl: invite.url, optOutUrl: optOutUrl(p.id) }),
    });
    sent = sms.ok;
    if (!sms.ok) failure = sms.error;
  } else if (channel === "email" && p.email) {
    const mail = interestedEmail({ businessName: p.business_name, summary, inviteUrl: invite.url, optOutUrl: optOutUrl(p.id) });
    const res = await sendEmail({ to: p.email, ...mail });
    sent = res.ok;
    if (!res.ok) failure = res.error;
  }
  await recordContact(admin, p);
  if (sent) {
    await admin.from("concierge_invites").update({ sms_sent_at: new Date().toISOString() }).eq("token", invite.token);
  }
  await writeAdminAuditLog({
    adminUserId: user.id,
    action: "concierge.interested",
    details: { prospect_id: p.id, lead_id: alert?.lead_id ?? null, channel, sent, failure },
  });
  refresh(p.id);
  return { ok: true, url: invite.url, channel, sent };
}

/** « Pas dispo » : tracé, reste suggérable pour les prochains chantiers. */
export async function markUnavailableAction(prospectId: string): Promise<{ ok: true } | Fail> {
  const { user, admin } = await guardAdmin();
  const p = await loadContactable(admin, prospectId);
  if (!p || p.opt_out) return { ok: false, error: "Prospect introuvable ou désinscrit." };
  await recordContact(admin, p);
  await writeAdminAuditLog({ adminUserId: user.id, action: "concierge.unavailable", details: { prospect_id: p.id } });
  refresh(p.id);
  return { ok: true };
}

/**
 * « Ne plus contacter (RGPD) » : opposition définitive. On garde le téléphone
 * (sinon un réimport le recréerait) et le nom ; notes et coordonnées effacées.
 */
export async function markOptOutAction(prospectId: string): Promise<{ ok: true } | Fail> {
  const { user, admin } = await guardAdmin();
  if (!UUID.test(prospectId)) return { ok: false, error: "Prospect invalide." };
  const { error } = await admin
    .from("prospect_artisans")
    .update({ opt_out: true, status: "blacklisted", notes: null, email: null, latitude: null, longitude: null })
    .eq("id", prospectId);
  if (error) return { ok: false, error: "Mise à jour impossible." };
  // Les liens d'invitation non utilisés deviennent caducs.
  await admin.from("concierge_invites").delete().eq("prospect_id", prospectId).is("claimed_at", null);
  await writeAdminAuditLog({ adminUserId: user.id, action: "concierge.opt_out", details: { prospect_id: prospectId } });
  refresh(prospectId);
  return { ok: true };
}

export async function updateProspectNotesAction(input: { prospectId: string; notes: string }): Promise<{ ok: true } | Fail> {
  const { admin } = await guardAdmin();
  if (!UUID.test(input.prospectId)) return { ok: false, error: "Prospect invalide." };
  const notes = input.notes.trim().slice(0, 4000) || null;
  const { error } = await admin.from("prospect_artisans").update({ notes }).eq("id", input.prospectId).eq("opt_out", false);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  refresh(input.prospectId);
  return { ok: true };
}
