import Link from "next/link";
import { ExternalLink, MessageSquare, Users } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";
import { SupabaseMissing } from "@/components/supabase-missing";
import { listCustomerContacts } from "@/lib/contacts/actions";

export default async function CustomerContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Contacts indisponibles" />;
  }

  const sp = await searchParams;
  const showInviteSuccess = sp.success === "invite";

  const res = await listCustomerContacts();
  const items = res.ok ? res.items : [];

  return (
    <div className="space-y-8">
      {showInviteSuccess && (
        <Alert>
          <AlertTitle>Bienvenue</AlertTitle>
          <AlertDescription>
            Ton compte est relié à l’artisan. Tu peux consulter sa page vitrine ou lui écrire.
          </AlertDescription>
        </Alert>
      )}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mes artisans</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Artisans avec lesquels tu es en relation. Le bouton <strong className="font-medium">Inviter</strong> en
          haut de page permet d’inviter un client ou un artisan sur la plateforme.
        </p>
      </div>

      {!items.length ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
          <Users className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 max-w-sm text-muted-foreground">
            Aucun artisan pour l’instant. Accepte une invitation ou écris à un artisan depuis sa page vitrine.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card">
          {items.map((item) => (
            <li key={item.artisanId} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{item.artisanLabel}</p>
                <p className="text-xs text-muted-foreground">
                  Dernière activité :{" "}
                  {new Date(item.lastActivityAt).toLocaleString("fr-FR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/site/${item.slug}`}
                  className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5" })}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Page vitrine
                </Link>
                {item.conversationId ? (
                  <Link
                    href={`/compte/messages/${item.conversationId}`}
                    className={buttonVariants({ size: "sm", className: "gap-1.5" })}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Messages
                  </Link>
                ) : (
                  <Link
                    href={`/site/${item.slug}`}
                    className={buttonVariants({ size: "sm", className: "gap-1.5" })}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Contacter
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
