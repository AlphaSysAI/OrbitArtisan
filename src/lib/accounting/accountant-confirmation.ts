import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { escapeHtml } from "@/lib/email/html";
import { sendEmail } from "@/lib/email/send-email";
import { getPublicSiteUrl } from "@/lib/site-url";

/** Lien de confirmation valable 14 jours. */
export const ACCOUNTANT_CONFIRM_TTL_MS = 14 * 86_400_000;
/** Délai minimum entre deux envois du lien (anti-abus). */
export const ACCOUNTANT_CONFIRM_RESEND_MS = 10 * 60_000;

export function hashConfirmToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isConfirmTokenFormat(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}


export type SendConfirmationResult = { ok: true } | { ok: false; error: "too_soon" | "no_email" | "send_failed" | "db" };

/**
 * Génère un nouveau jeton (l'ancien devient invalide) et envoie au comptable le lien
 * de confirmation. Le lien ouvre une page avec deux boutons (accepter / refuser) :
 * aucune action n'est déclenchée par la simple ouverture du lien, que les antivirus
 * de messagerie visitent souvent automatiquement.
 */
export async function sendAccountantConfirmation(
  db: SupabaseClient,
  input: { profileId: string; accountantEmail: string; businessName: string; lastSentAt: string | null },
  now: Date = new Date(),
): Promise<SendConfirmationResult> {
  const email = input.accountantEmail.trim();
  if (!email) return { ok: false, error: "no_email" };
  if (input.lastSentAt && now.getTime() - new Date(input.lastSentAt).getTime() < ACCOUNTANT_CONFIRM_RESEND_MS) {
    return { ok: false, error: "too_soon" };
  }

  const token = randomBytes(32).toString("base64url");
  const { error } = await db
    .from("profiles")
    .update({
      accountant_confirm_token_hash: hashConfirmToken(token),
      accountant_confirm_sent_at: now.toISOString(),
      accountant_email_confirmed_at: null,
    })
    .eq("id", input.profileId);
  if (error) {
    console.error("[accounting] jeton de confirmation", error.message);
    return { ok: false, error: "db" };
  }

  const url = `${getPublicSiteUrl()}/comptable/confirmer/${token}`;
  const business = escapeHtml(input.businessName || "Une entreprise");
  const res = await sendEmail({
    to: email,
    subject: `${input.businessName || "Une entreprise"} souhaite vous transmettre ses documents comptables`,
    html: `
      <p>Bonjour,</p>
      <p><strong>${business}</strong> utilise Soline pour gérer ses devis et factures, et vous a indiqué comme son comptable.</p>
      <p>Si vous acceptez, vous recevrez chaque fin de mois ses factures émises (PDF Factur-X et récapitulatif CSV) et les pièces qu'elle aura ajoutées (factures d'achat, tickets…).</p>
      <p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#f97316;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Accepter ou refuser</a></p>
      <p style="color:#64748b;font-size:13px">Tant que vous n'avez pas accepté, rien ne vous sera envoyé. Si vous ne connaissez pas cette entreprise, refusez ou ignorez ce message. Lien valable 14 jours.</p>
      <p>Soline — solinebtp.fr</p>`,
    text: `${input.businessName || "Une entreprise"} vous a indiqué comme son comptable sur Soline. Pour accepter ou refuser les envois comptables mensuels : ${url} (lien valable 14 jours). Sans action de votre part, rien ne vous sera envoyé.`,
  });
  if (!res.ok) {
    console.error("[accounting] e-mail de confirmation", res.error);
    return { ok: false, error: "send_failed" };
  }
  return { ok: true };
}

export type ConfirmationLookup =
  | { ok: true; profileId: string; userId: string; businessName: string; accountantEmail: string }
  | { ok: false; error: "invalid" | "expired" };

/** Retrouve la demande à partir du jeton (service role : page publique sans session). */
export async function findConfirmationByToken(
  db: SupabaseClient,
  token: string,
  now: Date = new Date(),
): Promise<ConfirmationLookup> {
  if (!isConfirmTokenFormat(token)) return { ok: false, error: "invalid" };
  const { data } = await db
    .from("profiles")
    .select("id, user_id, business_name, accountant_email, accountant_confirm_sent_at")
    .eq("accountant_confirm_token_hash", hashConfirmToken(token))
    .maybeSingle();
  if (!data?.id || !data.accountant_email) return { ok: false, error: "invalid" };
  const sentAt = data.accountant_confirm_sent_at ? new Date(data.accountant_confirm_sent_at as string).getTime() : 0;
  if (now.getTime() - sentAt > ACCOUNTANT_CONFIRM_TTL_MS) return { ok: false, error: "expired" };
  return {
    ok: true,
    profileId: data.id as string,
    userId: data.user_id as string,
    businessName: (data.business_name as string | null)?.trim() || "L'entreprise",
    accountantEmail: data.accountant_email as string,
  };
}
