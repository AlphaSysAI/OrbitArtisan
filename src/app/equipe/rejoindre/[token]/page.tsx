import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/session";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { hashTeamInviteToken, isTeamInviteTokenFormat, TEAM_MESSAGES } from "@/lib/team/team-invite-token";

import { acceptTeamInvite } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rejoindre une équipe sur SolineBTP", robots: { index: false, follow: false } };

type InviteView = { business: string; email: string; usable: boolean };

async function loadInvite(token: string): Promise<InviteView | null> {
  if (!isTeamInviteTokenFormat(token)) return null;
  const db = createSupabaseServiceRoleClient();
  if (!db) return null;
  const { data } = await db
    .from("profile_member_invites")
    .select("email, expires_at, accepted_at, revoked_at, profiles(business_name)")
    .eq("token_hash", hashTeamInviteToken(token))
    .maybeSingle();
  if (!data) return null;
  const profile = (Array.isArray(data.profiles) ? data.profiles[0] : data.profiles) as { business_name?: string } | null;
  return {
    business: profile?.business_name?.trim() || "Un artisan",
    email: data.email as string,
    usable: !data.accepted_at && !data.revoked_at && new Date(data.expires_at as string) > new Date(),
  };
}

export default async function TeamJoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { token } = await params;
  const { erreur } = await searchParams;
  const [invite, user] = await Promise.all([loadInvite(token), getCurrentUser()]);
  const page = `/equipe/rejoindre/${token}`;
  const accept = acceptTeamInvite.bind(null, token);

  return (
    <main className="flex min-h-dvh justify-center bg-slate-50 px-4 py-10 text-slate-900">
      <div className="w-full max-w-md space-y-4">
        <p className="text-center text-sm font-semibold tracking-wide text-orange-600">SolineBTP</p>
        {!invite || !invite.usable ? (
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h1 className="text-lg font-semibold">Invitation expirée ou invalide</h1>
            <p className="mt-2 text-sm text-slate-600">{TEAM_MESSAGES.invalid}</p>
          </div>
        ) : (
          <>
            <section className="space-y-3 rounded-2xl border bg-white p-6 shadow-sm">
              <h1 className="text-xl font-semibold">{invite.business} vous invite dans son équipe</h1>
              <p className="text-sm text-slate-600">
                Vous aurez accès aux devis, factures, rendez-vous, chantiers, clients et appels Soline du compte. Invitation
                envoyée à <strong>{invite.email}</strong>.
              </p>
            </section>
            {erreur ? (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                {TEAM_MESSAGES[erreur] ?? "L'opération n'a pas abouti. Réessayez."}
              </p>
            ) : null}
            {user ? (
              <form action={accept}>
                <button
                  type="submit"
                  className="flex h-14 w-full items-center justify-center rounded-xl bg-orange-600 text-base font-semibold text-white"
                >
                  Rejoindre l&apos;équipe
                </button>
              </form>
            ) : (
              <>
                <Link
                  href={`/register?next=${encodeURIComponent(page)}&email=${encodeURIComponent(invite.email)}`}
                  className="flex h-14 items-center justify-center rounded-xl bg-orange-600 text-base font-semibold text-white"
                >
                  Créer mon accès
                </Link>
                <p className="text-center text-sm text-slate-600">
                  Déjà un compte avec cette adresse ?{" "}
                  <Link href={`/login?role=artisan&next=${encodeURIComponent(page)}`} className="font-medium underline">
                    Se connecter
                  </Link>
                </p>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
