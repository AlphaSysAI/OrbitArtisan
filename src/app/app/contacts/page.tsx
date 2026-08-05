import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseMissing } from "@/components/supabase-missing";
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contacts clients</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Clients liés à ton activité. Utilise le bouton <strong className="font-medium">Inviter</strong> en haut
          de page pour inviter un client ou un autre artisan.
        </p>
      </div>

      {!profile?.id && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profil artisan</CardTitle>
            <CardDescription>
              Configure ton activité pour relier automatiquement les clients que tu invites.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Mes clients</h2>

        {!linked.length && !pending.length ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
            <Users className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 max-w-sm text-muted-foreground">
              Aucun contact pour l’instant. Les clients qui acceptent une invitation ou vous écrivent depuis la vitrine
              apparaîtront ici.
            </p>
          </div>
        ) : (
          <ul className="divide-y rounded-2xl border bg-card">
            {linked.map((item) => (
              <li key={item.customerUserId}>
                <Link
                  href={`/app/contacts/${item.customerUserId}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{item.label}</p>
                    {item.email && <p className="text-xs text-muted-foreground">{item.email}</p>}
                  </div>
                  <span className="text-sm text-primary">Fiche client →</span>
                </Link>
              </li>
            ))}
            {pending.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{item.invitedName ?? item.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Invitation {item.accountType === "artisan" ? "artisan" : "client"} en attente · {item.email}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CancelInvitationButton invitationId={item.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
