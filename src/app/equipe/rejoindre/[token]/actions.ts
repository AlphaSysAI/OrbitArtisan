"use server";

import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/auth/require-artisan";
import { hashTeamInviteToken, isTeamInviteTokenFormat } from "@/lib/team/team-invite-token";

/** L'invité connecté rejoint l'équipe ; erreur affichée sur la page d'invitation. */
export async function acceptTeamInvite(token: string): Promise<void> {
  if (!isTeamInviteTokenFormat(token)) redirect(`/equipe/rejoindre/${encodeURIComponent(token)}?erreur=invalid`);
  const page = `/equipe/rejoindre/${token}`;
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) redirect(`/login?role=artisan&next=${encodeURIComponent(page)}`);

  const { data, error } = await auth.supabase.rpc("accept_team_invite", { p_token_hash: hashTeamInviteToken(token) });
  if (error || typeof data !== "string") {
    console.error("[team] accept_team_invite", error);
    redirect(`${page}?erreur=failed`);
  }
  if (data !== "ok") redirect(`${page}?erreur=${encodeURIComponent(data)}`);
  redirect("/app?equipe=1");
}
