"use server";

import { revalidatePath } from "next/cache";

import { requireArtisanProfileId } from "@/lib/auth/require-artisan";
import { escapeHtml } from "@/lib/email/html";
import { sendEmail } from "@/lib/email/send-email";
import { getPublicSiteUrl } from "@/lib/site-url";
import { hashTeamInviteToken, newTeamInviteToken, TEAM_MESSAGES } from "@/lib/team/team-invite-token";

type TeamActionResult = { ok: true; message?: string } | { ok: false; message: string };

async function requireOwner() {
  const auth = await requireArtisanProfileId(["business_name"]);
  if (!auth.ok || !auth.isOwner) return null;
  return auth;
}

/** Invite un collaborateur par e-mail (formule Ultra). */
export async function inviteTeamMember(rawEmail: string): Promise<TeamActionResult> {
  const auth = await requireOwner();
  if (!auth) return { ok: false, message: TEAM_MESSAGES.not_owner };

  const email = rawEmail.trim().toLowerCase();
  const token = newTeamInviteToken();
  const { data, error } = await auth.supabase.rpc("create_team_invite", {
    p_email: email,
    p_token_hash: hashTeamInviteToken(token),
  });
  if (error || typeof data !== "string") {
    console.error("[team] create_team_invite", error);
    return { ok: false, message: "Impossible d'envoyer l'invitation pour le moment. Réessayez." };
  }
  if (data !== "ok") return { ok: false, message: TEAM_MESSAGES[data] ?? "Invitation impossible." };

  const business = String(auth.profile.business_name ?? "").trim() || "un artisan";
  const link = `${getPublicSiteUrl()}/equipe/rejoindre/${token}`;
  const sent = await sendEmail({
    to: email,
    subject: `${business} vous invite sur SolineBTP`,
    html: `
      <p>Bonjour,</p>
      <p><strong>${escapeHtml(business)}</strong> vous invite à rejoindre son compte SolineBTP : devis, factures,
      rendez-vous, chantiers et appels Soline, partagés avec toute l'équipe.</p>
      <p><a href="${link}">Rejoindre l'équipe</a></p>
      <p>Ce lien est valable 7 jours. Si vous n'attendiez pas cette invitation, ignorez simplement cet e-mail.</p>
    `,
    text: `${business} vous invite à rejoindre son compte SolineBTP : ${link} (valable 7 jours).`,
  });
  revalidatePath("/app/reglages");
  if (!sent.ok) {
    return { ok: true, message: `Invitation créée, mais l'e-mail n'a pas pu partir. Lien à transmettre : ${link}` };
  }
  return { ok: true, message: `Invitation envoyée à ${email}.` };
}

export async function revokeTeamInvite(inviteId: string): Promise<TeamActionResult> {
  const auth = await requireOwner();
  if (!auth) return { ok: false, message: TEAM_MESSAGES.not_owner };
  const { error } = await auth.supabase.rpc("revoke_team_invite", { p_invite_id: inviteId });
  if (error) return { ok: false, message: "Impossible d'annuler l'invitation." };
  revalidatePath("/app/reglages");
  return { ok: true };
}

export async function removeTeamMember(memberUserId: string): Promise<TeamActionResult> {
  const auth = await requireOwner();
  if (!auth) return { ok: false, message: TEAM_MESSAGES.not_owner };
  const { error } = await auth.supabase.rpc("remove_team_member", { p_user_id: memberUserId });
  if (error) return { ok: false, message: "Impossible de retirer ce collaborateur." };
  revalidatePath("/app/reglages");
  return { ok: true };
}
