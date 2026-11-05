import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";

import { TeamInviteForm, TeamRowAction } from "@/components/settings/team-settings-controls";
import { findSubscriptionPlan, SUBSCRIPTION_PLANS } from "@/lib/billing/subscription-plans";
import { formatDateFr } from "@/lib/format/date";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

/** Onglet « Équipe » des réglages : collaborateurs du compte (formule Ultra). */
export async function TeamSettingsSection({
  supabase,
  profileId,
  ownerUserId,
  currentUserId,
  planId,
}: {
  supabase: SupabaseClient;
  profileId: string;
  ownerUserId: string;
  currentUserId: string;
  planId: string;
}) {
  const isOwner = ownerUserId === currentUserId;
  const usersIncluded = findSubscriptionPlan(planId)?.usersIncluded ?? 1;
  const multiUserPlan = SUBSCRIPTION_PLANS.find((p) => p.usersIncluded > 1);

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.from("profile_members").select("user_id, created_at").eq("profile_id", profileId).order("created_at"),
    isOwner
      ? supabase
          .from("profile_member_invites")
          .select("id, email, expires_at")
          .eq("profile_id", profileId)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at")
      : Promise.resolve({ data: [] as { id: string; email: string; expires_at: string }[] }),
  ]);

  // Adresses des membres : lisibles uniquement côté serveur.
  const admin = createSupabaseServiceRoleClient();
  const emailOf = async (userId: string) =>
    admin ? ((await admin.auth.admin.getUserById(userId)).data.user?.email ?? "—") : "—";
  const ownerEmail = await emailOf(ownerUserId);
  const memberRows = await Promise.all(
    (members ?? []).map(async (m, index) => ({
      userId: m.user_id as string,
      email: await emailOf(m.user_id as string),
      since: m.created_at as string,
      active: index < usersIncluded - 1,
    })),
  );
  const seatsUsed = 1 + memberRows.length + (invites?.length ?? 0);

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold tracking-tight">Équipe</h2>
        <p className="text-sm text-muted-foreground">
          Vos collaborateurs accèdent aux devis, factures, rendez-vous, chantiers, clients et appels Soline. Seul le
          titulaire gère l&apos;abonnement, l&apos;encaissement, les mentions légales et la suppression du compte.
        </p>
      </div>

      <ul className="divide-y rounded-xl border">
        <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
          <span className="font-medium">{ownerEmail}</span>
          <span className="text-muted-foreground">Titulaire{isOwner ? " (vous)" : ""}</span>
        </li>
        {memberRows.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <span className="space-y-0.5">
              <span className="block font-medium">{m.email}</span>
              <span className="block text-xs text-muted-foreground">
                Collaborateur depuis le {formatDateFr(m.since)}
                {m.active ? "" : " · accès suspendu (formule sans utilisateur supplémentaire)"}
                {m.userId === currentUserId ? " · vous" : ""}
              </span>
            </span>
            {isOwner ? <TeamRowAction kind="member" id={m.userId} label={m.email} /> : null}
          </li>
        ))}
        {(invites ?? []).map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <span className="space-y-0.5">
              <span className="block font-medium">{inv.email}</span>
              <span className="block text-xs text-muted-foreground">
                Invitation en attente · expire le {formatDateFr(inv.expires_at)}
              </span>
            </span>
            <TeamRowAction kind="invite" id={inv.id} label={inv.email} />
          </li>
        ))}
      </ul>

      {!isOwner ? null : usersIncluded <= 1 ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Votre formule comprend 1 utilisateur.{" "}
          {multiUserPlan ? (
            <>
              La formule {multiUserPlan.name} inclut {multiUserPlan.usersIncluded} utilisateurs.{" "}
              <Link href="/app/reglages?tab=abonnement" className="font-medium text-foreground underline">
                Voir les formules
              </Link>
            </>
          ) : null}
        </p>
      ) : seatsUsed >= usersIncluded ? (
        <p className="text-sm text-muted-foreground">
          {usersIncluded} utilisateurs sur {usersIncluded} : toutes les places de votre formule sont prises.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {seatsUsed} utilisateur{seatsUsed > 1 ? "s" : ""} sur {usersIncluded}. L&apos;invité reçoit un lien
            valable 7 jours.
          </p>
          <TeamInviteForm />
        </div>
      )}
    </section>
  );
}
