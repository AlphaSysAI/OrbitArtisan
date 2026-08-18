import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";

import { AppEmptyState } from "@/components/app/app-empty-state";
import { AppListItem } from "@/components/app/app-list-item";
import { AppPageHeader } from "@/components/app/app-page-header";
import { Badge } from "@/components/ui/badge";
import { SupabaseMissing } from "@/components/supabase-missing";
import { formatContactDisplayName } from "@/lib/contacts/display-name";
import { listArtisanContacts } from "@/lib/contacts/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { CancelInvitationButton } from "./cancel-invitation-button";

export default async function ArtisanContactsPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Contacts indisponibles" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/contacts");

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();

  const res = await listArtisanContacts();
  const items = res.ok ? res.items : [];
  const linked = items.filter((i) => i.kind === "linked");
  const pending = items.filter((i) => i.kind === "pending");

  return (
    <div className="space-y-8">
      <AppPageHeader
        eyebrow="Clients"
        title="Contacts"
        description="Clients liés à ton activité. Utilise Inviter en haut de page pour envoyer une invitation."
      />

      {!profile?.id ? (
        <div className="app-surface border-warning/40 bg-warning/5 p-5 text-sm leading-relaxed">
          Configure ton activité pour relier automatiquement les clients que tu invites.{" "}
          <Link href="/app/reglages?tab=activite" className="font-semibold underline underline-offset-4">
            Ouvrir les réglages
          </Link>
        </div>
      ) : null}

      {!linked.length && !pending.length ? (
        <AppEmptyState
          icon={Users}
          title="Aucun contact pour l’instant"
          description="Les clients qui acceptent une invitation ou t’écrivent depuis la vitrine apparaîtront ici."
        />
      ) : (
        <div className="space-y-8">
          {linked.length ? (
            <section className="space-y-3">
              <h2 className="font-display text-xl font-semibold tracking-tight">
                Mes clients
                <span className="ml-2 text-base font-normal text-muted-foreground">({linked.length})</span>
              </h2>
              <ul className="space-y-3">
                {linked.map((item) => (
                  <li key={item.customerUserId}>
                    <AppListItem
                      href={`/app/contacts/${item.customerUserId}`}
                      title={item.label}
                      subtitle={item.email}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {pending.length ? (
            <section className="space-y-3">
              <h2 className="font-display text-xl font-semibold tracking-tight">Invitations en attente</h2>
              <ul className="space-y-3">
                {pending.map((item) => (
                  <li key={item.id}>
                    <AppListItem
                      title={formatContactDisplayName({
                        name: item.invitedName,
                        email: item.email,
                        fallback: item.email,
                      })}
                      subtitle={`Invitation ${item.accountType === "artisan" ? "artisan" : "client"} · ${item.email}`}
                      meta={<Badge variant="secondary">En attente</Badge>}
                      trailing={<CancelInvitationButton invitationId={item.id} />}
                      emphasis="warning"
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
