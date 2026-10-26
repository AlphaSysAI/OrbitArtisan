import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { emailButton, escapeHtml } from "@/lib/email/html";
import { sendEmail } from "@/lib/email/send-email";
import { getPublicSiteUrl } from "@/lib/site-url";

import {
  generateInvitationToken,
  hashInvitationToken,
  isInvitationTokenFormat,
  REFERRER_INVITATION_TTL_MS,
} from "./invitation-token";
import type { ReferrerInvitationInput } from "./validation";

type Db = SupabaseClient;

export type InvitationRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  siren: string;
  created_at: string;
  expires_at: string;
  sent_at: string | null;
  send_count: number;
  claimed_at: string | null;
  cancelled_at: string | null;
};

const INVITATION_COLUMNS =
  "id, email, first_name, last_name, siren, created_at, expires_at, sent_at, send_count, claimed_at, cancelled_at";

export type InvitationState = "open" | "expired" | "claimed" | "cancelled";

export function invitationState(row: Pick<InvitationRow, "expires_at" | "claimed_at" | "cancelled_at">, now = new Date()): InvitationState {
  if (row.claimed_at) return "claimed";
  if (row.cancelled_at) return "cancelled";
  return new Date(row.expires_at).getTime() <= now.getTime() ? "expired" : "open";
}

export function invitationUrl(token: string): string {
  return `${getPublicSiteUrl()}/apporteur/invitation/${token}`;
}

function invitationEmail(input: { firstName: string; url: string }) {
  const first = escapeHtml(input.firstName);
  return {
    subject: "Votre accès apporteur d'affaires SolineBTP",
    html: `
      <p>Bonjour ${first},</p>
      <p>L'équipe Soline vous a ouvert un accès <strong>apporteur d'affaires</strong> sur SolineBTP.</p>
      <p>Il vous reste à compléter les informations de votre entreprise et à choisir votre mot de passe (5 minutes).</p>
      ${emailButton(input.url, "Créer mon accès apporteur")}
      <p style="color:#64748b;font-size:13px">Lien personnel, valable 14 jours et utilisable une seule fois. Si vous n'attendiez pas ce message, ignorez-le : aucun compte ne sera créé.</p>
      <p>Soline — solinebtp.fr</p>`,
    text: `Bonjour ${input.firstName},\n\nL'équipe Soline vous a ouvert un accès apporteur d'affaires sur SolineBTP. Complétez votre entreprise et choisissez votre mot de passe : ${input.url}\n\nLien personnel, valable 14 jours, utilisable une seule fois. Si vous n'attendiez pas ce message, ignorez-le.`,
  };
}

type SendOutcome = { ok: true; url: string; sent: boolean; invitationId: string };
type CreateResult =
  | SendOutcome
  | { ok: false; error: "already_referrer" | "already_invited" | "email_has_account" | "db" };

async function sendAndMark(db: Db, row: { id: string; first_name: string; email: string; send_count: number }, token: string, now: Date) {
  const url = invitationUrl(token);
  const mail = invitationEmail({ firstName: row.first_name, url });
  const res = await sendEmail({ to: row.email, ...mail });
  if (!res.ok) console.error("[referrer invitation] envoi", res.error);
  const { error } = await db
    .from("business_referrer_invitations")
    .update(res.ok ? { sent_at: now.toISOString(), send_count: row.send_count + 1 } : {})
    .eq("id", row.id);
  if (error) console.error("[referrer invitation] marquage envoi", error.message);
  return { url, sent: res.ok };
}

/**
 * Création par l'admin : une invitation ouverte au plus par adresse. Une invitation
 * expirée est clôturée puis remplacée. Refus si l'adresse a déjà un compte Soline
 * (un même compte ne peut pas être artisan/client et apporteur).
 */
export async function createReferrerInvitation(
  db: Db,
  input: ReferrerInvitationInput & { adminUserId: string },
  now = new Date(),
): Promise<CreateResult> {
  const { data: referrer } = await db.from("business_referrers").select("id").eq("email", input.email).maybeSingle();
  if (referrer) return { ok: false, error: "already_referrer" };

  const { data: existingUserId, error: lookupError } = await db.rpc("lookup_auth_user_id_by_email", { p_email: input.email });
  if (lookupError) {
    console.error("[referrer invitation] recherche compte", lookupError.message);
    return { ok: false, error: "db" };
  }
  if (existingUserId) return { ok: false, error: "email_has_account" };

  const { data: open } = await db
    .from("business_referrer_invitations")
    .select(INVITATION_COLUMNS)
    .eq("email", input.email)
    .is("claimed_at", null)
    .is("cancelled_at", null)
    .maybeSingle();
  if (open) {
    if (invitationState(open as InvitationRow, now) === "open") return { ok: false, error: "already_invited" };
    await db.from("business_referrer_invitations").update({ cancelled_at: now.toISOString() }).eq("id", (open as InvitationRow).id);
  }

  const token = generateInvitationToken();
  const { data, error } = await db
    .from("business_referrer_invitations")
    .insert({
      email: input.email,
      first_name: input.first_name,
      last_name: input.last_name,
      siren: input.siren,
      token_hash: hashInvitationToken(token),
      created_by: input.adminUserId,
      expires_at: new Date(now.getTime() + REFERRER_INVITATION_TTL_MS).toISOString(),
    })
    .select("id, first_name, email, send_count")
    .single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: "already_invited" };
    console.error("[referrer invitation] création", error?.code, error?.message);
    return { ok: false, error: "db" };
  }
  const sent = await sendAndMark(db, data as { id: string; first_name: string; email: string; send_count: number }, token, now);
  return { ok: true, invitationId: data.id as string, ...sent };
}

/** Renvoi : nouveau jeton (l'ancien lien cesse de fonctionner), validité repartie pour 14 jours. */
export async function resendReferrerInvitation(
  db: Db,
  invitationId: string,
  now = new Date(),
): Promise<SendOutcome | { ok: false; error: "not_found" | "closed" | "db" }> {
  const { data } = await db.from("business_referrer_invitations").select(INVITATION_COLUMNS).eq("id", invitationId).maybeSingle();
  if (!data) return { ok: false, error: "not_found" };
  const row = data as InvitationRow;
  if (row.claimed_at || row.cancelled_at) return { ok: false, error: "closed" };

  const token = generateInvitationToken();
  const { error } = await db
    .from("business_referrer_invitations")
    .update({ token_hash: hashInvitationToken(token), expires_at: new Date(now.getTime() + REFERRER_INVITATION_TTL_MS).toISOString() })
    .eq("id", row.id)
    .is("claimed_at", null)
    .is("cancelled_at", null);
  if (error) {
    console.error("[referrer invitation] renouvellement", error.message);
    return { ok: false, error: "db" };
  }
  const sent = await sendAndMark(db, row, token, now);
  return { ok: true, invitationId: row.id, ...sent };
}

export async function cancelReferrerInvitation(db: Db, invitationId: string, now = new Date()): Promise<boolean> {
  const { data, error } = await db
    .from("business_referrer_invitations")
    .update({ cancelled_at: now.toISOString() })
    .eq("id", invitationId)
    .is("claimed_at", null)
    .is("cancelled_at", null)
    .select("id");
  if (error) console.error("[referrer invitation] annulation", error.message);
  return Boolean(data?.length);
}

export type InvitationLookup =
  | { ok: true; invitation: InvitationRow; tokenHash: string }
  | { ok: false; reason: "invalid" | "expired" | "claimed" | "cancelled" };

/** Lecture publique d'un lien (service role) : rien n'est modifié à l'ouverture. */
export async function loadReferrerInvitation(db: Db, token: unknown, now = new Date()): Promise<InvitationLookup> {
  if (!isInvitationTokenFormat(token)) return { ok: false, reason: "invalid" };
  const tokenHash = hashInvitationToken(token);
  const { data, error } = await db
    .from("business_referrer_invitations")
    .select(INVITATION_COLUMNS)
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) console.error("[referrer invitation] lecture", error.message);
  if (!data) return { ok: false, reason: "invalid" };
  const state = invitationState(data as InvitationRow, now);
  if (state !== "open") return { ok: false, reason: state };
  return { ok: true, invitation: data as InvitationRow, tokenHash };
}
