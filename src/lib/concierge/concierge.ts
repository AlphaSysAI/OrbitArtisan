import "server-only";

import { createHmac } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAnonymizedSummary, formatBudget, type AnonymizedLeadSummary } from "@/lib/concierge/summary";
import { emailButton, escapeHtml } from "@/lib/email/html";
import { sendEmail } from "@/lib/email/send-email";
import { signToken, verifyToken } from "@/lib/security/signed-token";
import { getPublicSiteUrl } from "@/lib/site-url";
import { formatPhoneFr } from "@/lib/phone";
import { lotLabel, parseLeadLots, type LeadLot } from "@/lib/leads/lots";

type Db = SupabaseClient;

/** Rayon de recherche des prospects (km) : plus large que le matching inscrits (30 km). */
const CONCIERGE_RADIUS_KM = 40;
const MAX_ARTISANS = 3;

type ConciergeProspect = {
  id: string;
  business_name: string;
  phone: string;
  city: string | null;
  postal_code: string | null;
  trade: string;
  distance_km: number;
  /** Lot concerné (demande multi-corps d'état), sinon null. */
  lot?: string | null;
};


/**
 * Chantier finalisé par un particulier : si moins de 3 artisans INSCRITS ont été
 * trouvés, on complète avec des prospects à ≤ 40 km et on alerte l'admin.
 * Idempotent (1 alerte max par chantier). Ne contacte personne : l'admin appelle.
 */
export async function runConciergeForLead(db: Db, leadToken: string): Promise<{ alertId: string | null }> {
  const { data: lead } = await db
    .from("leads")
    .select("id, trade, trade_category, address_label, estimate_min, estimate_max, ai_qualification, latitude, longitude, lots")
    .eq("public_token", leadToken)
    .maybeSingle();
  if (!lead?.id || lead.latitude === null) return { alertId: null };

  const [{ data: matchRows }, { data: existing }] = await Promise.all([
    db.from("lead_matches").select("lot_index").eq("lead_id", lead.id),
    db.from("concierge_alerts").select("id").eq("lead_id", lead.id).maybeSingle(),
  ]);
  if (existing?.id) return { alertId: existing.id as string };
  const registeredCount = matchRows?.length ?? 0;

  // Un lot = un métier : on complète chaque lot à 3 artisans (lots validés, sinon le métier du lead).
  const parsedLots = parseLeadLots(lead.lots);
  const lots = parsedLots.length
    ? parsedLots
    : [{ trade_category: lead.trade_category as string | null, trade: lead.trade as string | null, summary: "" }];
  const perLot = await Promise.all(
    lots.map(async (lot, index) => {
      const registeredInLot = (matchRows ?? []).filter((m) => (m.lot_index ?? 0) === index).length;
      if (registeredInLot >= MAX_ARTISANS) return { registeredInLot, prospects: [] as ConciergeProspect[] };
      const { data: candidates, error } = await db.rpc("concierge_prospect_candidates", {
        p_lead_id: lead.id,
        p_radius_km: CONCIERGE_RADIUS_KM,
        p_limit: MAX_ARTISANS - registeredInLot,
        ...(parsedLots.length ? { p_trade_category: lot.trade_category, p_trade: lot.trade } : {}),
      });
      if (error) console.error("[concierge] candidats", error.message);
      const lotName = parsedLots.length > 1 ? lotLabel(lot as LeadLot) : null;
      return {
        registeredInLot,
        prospects: ((candidates ?? []) as ConciergeProspect[]).map((p) => ({ ...p, lot: lotName })),
      };
    }),
  );
  if (perLot.every((l) => l.registeredInLot >= MAX_ARTISANS)) return { alertId: null };
  // Un même prospect peut correspondre à deux lots : une seule ligne.
  const seen = new Set<string>();
  const prospects = perLot.flatMap((l) => l.prospects).filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  // Chantier couvert partiellement mais aucun prospect : rien à faire pour l'admin.
  if (!prospects.length && registeredCount > 0) return { alertId: null };

  const summary = buildAnonymizedSummary({
    trade: lead.trade as string | null,
    trade_category: lead.trade_category as string | null,
    lotLabels: parsedLots.length > 1 ? parsedLots.map(lotLabel) : undefined,
    address_label: lead.address_label as string | null,
    estimate_min: lead.estimate_min as number | null,
    estimate_max: lead.estimate_max as number | null,
    need_summary: ((lead.ai_qualification as { need_summary?: string } | null)?.need_summary ?? null) as string | null,
  });

  const { data: alert, error: insertError } = await db
    .from("concierge_alerts")
    .insert({ lead_id: lead.id, registered_count: registeredCount, prospect_ids: prospects.map((p) => p.id), summary })
    .select("id")
    .single();
  if (insertError || !alert) {
    // Conflit d'unicité = alerte créée en parallèle : rien à renvoyer.
    return { alertId: null };
  }

  await notifyAdmin({ alertId: alert.id as string, summary, prospects, registeredCount });
  return { alertId: alert.id as string };
}

async function notifyAdmin(input: {
  alertId: string;
  summary: AnonymizedLeadSummary;
  prospects: ConciergeProspect[];
  registeredCount: number;
}) {
  const url = `${getPublicSiteUrl()}/admin/conciergerie?alerte=${input.alertId}`;
  const { summary, prospects } = input;
  const title = `${summary.trade} · ${summary.commune ?? "commune inconnue"} · ${formatBudget(summary.budget)}`;

  const to = (process.env.ADMIN_ALERT_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (to.length) {
    const rows = prospects
      .map(
        (p) =>
          `<li>${p.lot ? `[${escapeHtml(p.lot)}] ` : ""}<strong>${escapeHtml(p.business_name)}</strong> — <a href="tel:${escapeHtml(p.phone)}">${escapeHtml(formatPhoneFr(p.phone))}</a> · ${escapeHtml(p.city ?? "")} (${p.distance_km} km)</li>`,
      )
      .join("");
    await Promise.all(
      to.map((addr) =>
        sendEmail({
          to: addr,
          subject: `🧰 Chantier à placer — ${title}`,
          html: `
            <p><strong>${escapeHtml(title)}</strong></p>
            ${summary.need ? `<p>${escapeHtml(summary.need)}</p>` : ""}
            <p>${input.registeredCount} artisan${input.registeredCount > 1 ? "s" : ""} inscrit${input.registeredCount > 1 ? "s" : ""} trouvé${input.registeredCount > 1 ? "s" : ""}.
            ${prospects.length ? `À appeler :</p><ol>${rows}</ol>` : "Aucun prospect dans la zone.</p>"}
            ${emailButton(url, "Ouvrir la conciergerie")}`,
          text: `${title}\n${prospects.map((p) => `${p.business_name} ${formatPhoneFr(p.phone)}`).join("\n")}\n${url}`,
        }).catch(() => undefined),
      ),
    );
  }

  const webhook = process.env.ADMIN_ALERT_WEBHOOK_URL?.trim();
  if (webhook) {
    const body = JSON.stringify({
      type: "concierge.alert",
      alert_id: input.alertId,
      summary,
      registered_count: input.registeredCount,
      prospects: prospects.map((p) => ({ name: p.business_name, phone: p.phone, city: p.city, distance_km: p.distance_km })),
      url,
    });
    const secret = process.env.ADMIN_ALERT_WEBHOOK_SECRET?.trim();
    try {
      await fetch(webhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { "X-Soline-Signature": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` } : {}),
        },
        body,
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      console.error("[concierge] webhook", error instanceof Error ? error.message : error);
    }
  }
}

/** Lien d'invitation unique prospect × chantier (réutilisé s'il existe et n'a pas expiré). */
export async function ensureConciergeInvite(
  db: Db,
  input: { prospectId: string; leadId: string | null; adminUserId: string },
): Promise<{ token: string; url: string } | null> {
  let query = db.from("concierge_invites").select("token, expires_at, claimed_at").eq("prospect_id", input.prospectId);
  query = input.leadId ? query.eq("lead_id", input.leadId) : query.is("lead_id", null);
  const { data: existing } = await query.maybeSingle();
  if (existing && !existing.claimed_at && new Date(existing.expires_at as string).getTime() > Date.now() + 86_400_000) {
    return { token: existing.token as string, url: inviteUrl(existing.token as string) };
  }
  if (existing) {
    let del = db.from("concierge_invites").delete().eq("prospect_id", input.prospectId);
    del = input.leadId ? del.eq("lead_id", input.leadId) : del.is("lead_id", null);
    await del;
  }
  const { data, error } = await db
    .from("concierge_invites")
    .insert({ prospect_id: input.prospectId, lead_id: input.leadId, created_by: input.adminUserId })
    .select("token")
    .single();
  if (error || !data) return null;
  return { token: data.token as string, url: inviteUrl(data.token as string) };
}

function inviteUrl(token: string): string {
  return `${getPublicSiteUrl()}/rejoindre/${token}`;
}

export function optOutUrl(prospectId: string): string {
  return `${getPublicSiteUrl()}/stop/${optOutToken(prospectId)}`;
}

/** Lien de désinscription (RGPD) signé, inclus dans chaque SMS. Signature courte (24) conservée : les liens déjà envoyés restent valides. */
const OPT_OUT_SIG_LENGTH = 24;

function optOutToken(prospectId: string): string {
  return signToken("prospect-optout", prospectId, { sigLength: OPT_OUT_SIG_LENGTH });
}

export function verifyOptOutToken(token: string): string | null {
  return verifyToken("prospect-optout", token, { sigLength: OPT_OUT_SIG_LENGTH });
}

/** SMS « Intéressé » : court, identifié, avec lien d'inscription et désinscription. */
export function interestedSmsBody(input: { summary: AnonymizedLeadSummary | null; inviteUrl: string; optOutUrl: string }): string {
  const job = input.summary ? `un chantier ${input.summary.trade.toLowerCase()}${input.summary.commune ? ` a ${input.summary.commune.replace(/^\d{5}\s/, "")}` : ""}` : "des chantiers pres de chez vous";
  return `Soline (suite a notre appel) : ${job} vous attend. Inscription gratuite : ${input.inviteUrl} - Ne plus etre contacte : ${input.optOutUrl}`;
}

/**
 * E-mail « Intéressé » (lignes fixes uniquement, après l'appel) : identifié, avec
 * l'origine des coordonnées (art. 14 RGPD) et le lien de désinscription.
 */
export function interestedEmail(input: {
  businessName: string;
  summary: AnonymizedLeadSummary | null;
  inviteUrl: string;
  optOutUrl: string;
}): { subject: string; html: string; text: string } {
  const job = input.summary
    ? `un chantier ${input.summary.trade.toLowerCase()}${input.summary.commune ? ` à ${input.summary.commune.replace(/^\d{5}\s/, "")}` : ""}`
    : "des chantiers près de chez vous";
  const subject = input.summary ? `Suite à notre appel : ${job}` : "Suite à notre appel : Soline";
  const origin =
    "Vous recevez ce message à la suite de notre appel téléphonique. Vos coordonnées professionnelles proviennent d'un annuaire public d'entreprises (fiche d'établissement en ligne).";
  const html = `
    <p>Bonjour ${escapeHtml(input.businessName)},</p>
    <p>Comme convenu par téléphone, ${escapeHtml(job)} vous attend sur Soline, la plateforme qui met en relation particuliers et artisans du bâtiment de votre secteur.</p>
    ${input.summary?.need ? `<p><em>${escapeHtml(input.summary.need)}</em></p>` : ""}
    <p>L'inscription est gratuite et débloque la demande immédiatement.</p>
    ${emailButton(input.inviteUrl, "Voir le chantier et m'inscrire")}
    <p style="color:#64748b;font-size:12px">${escapeHtml(origin)} Vous ne souhaitez plus être contacté ? <a href="${escapeHtml(input.optOutUrl)}">Cliquez ici</a> : vos coordonnées seront effacées de nos fichiers.</p>`;
  const text = `Bonjour ${input.businessName},\n\nComme convenu par téléphone, ${job} vous attend sur Soline. Inscription gratuite : ${input.inviteUrl}\n\n${origin}\nNe plus être contacté : ${input.optOutUrl}`;
  return { subject, html, text };
}

/**
 * Des prospects (artisans non inscrits) existent-ils pour ce chantier ? Sert
 * uniquement à adapter le message au particulier : ils ne sont jamais nommés.
 */
export async function hasConciergeProspects(db: Db, leadToken: string): Promise<boolean> {
  const { data: leadId } = await db.rpc("lead_id_from_token", { p_token: leadToken });
  if (typeof leadId !== "string") return false;
  const { data } = await db.rpc("concierge_prospect_candidates", {
    p_lead_id: leadId,
    p_radius_km: CONCIERGE_RADIUS_KM,
    p_limit: 1,
  });
  return Array.isArray(data) && data.length > 0;
}
