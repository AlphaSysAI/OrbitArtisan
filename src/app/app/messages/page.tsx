import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";

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
      <div className="rounded-2xl border bg-card p-8 text-center">
        <p className="text-muted-foreground">Crée d’abord ton activité pour recevoir des messages clients.</p>
        <Link href="/app/profile" className={buttonVariants({ className: "mt-4 inline-flex" })}>
          Mon activité
        </Link>
      </div>
    );
  }

  const res = await listConversationsForArtisan();
  const items = res.ok ? res.items : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Messages clients</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Les personnes qui t’écrivent depuis ta page vitrine apparaissent ici.
        </p>
      </div>

      {!items.length ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 max-w-sm text-muted-foreground">Aucun message pour l’instant.</p>
        </div>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/app/messages/${item.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
              >
                <div>
                  <p className="font-medium">{item.customer_label}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.updated_at).toLocaleString("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <span className="text-sm text-primary">Ouvrir →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
