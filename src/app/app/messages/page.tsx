import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";

import { AppEmptyState } from "@/components/app/app-empty-state";
import { AppListItem } from "@/components/app/app-list-item";
import { AppPageHeader } from "@/components/app/app-page-header";
import { buttonVariants } from "@/components/ui/button-variants";
import { SupabaseMissing } from "@/components/supabase-missing";
import { listConversationsForArtisan } from "@/lib/messages/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ArtisanMessagesPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Messages indisponibles" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/app/messages");
  }

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile) {
    return (
      <div className="space-y-8">
        <AppPageHeader eyebrow="Communication" title="Messages" />
        <AppEmptyState
          icon={MessageSquare}
          title="Crée d’abord ton activité"
          description="Une fois ton profil en place, les messages clients depuis la vitrine arriveront ici."
          action={
            <Link href="/app/reglages?tab=activite" className={buttonVariants({ size: "lg" })}>
              Mon activité
            </Link>
          }
        />
      </div>
    );
  }

  const res = await listConversationsForArtisan();
  const items = res.ok ? res.items : [];

  return (
    <div className="space-y-8">
      <AppPageHeader
        eyebrow="Communication"
        title="Messages"
        description="Les personnes qui t’écrivent depuis ta page vitrine apparaissent ici."
      />

      {!items.length ? (
        <AppEmptyState
          icon={MessageSquare}
          title="Boîte vide"
          description="Aucun message pour l’instant. Partage ta vitrine pour démarrer la conversation."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <AppListItem
                href={`/app/messages/${item.id}`}
                title={item.customer_label}
                subtitle={
                  item.is_lead
                    ? `Demande Soline · ${new Date(item.updated_at).toLocaleString("fr-FR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}`
                    : new Date(item.updated_at).toLocaleString("fr-FR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
