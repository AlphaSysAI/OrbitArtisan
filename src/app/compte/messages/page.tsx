import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";

import { SupabaseMissing } from "@/components/supabase-missing";
import { listConversationsForCustomer } from "@/lib/messages/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ClientMessagesPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Messages indisponibles" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/compte/messages");

  const res = await listConversationsForCustomer();
  const items = res.ok ? res.items : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tes conversations avec les artisans.</p>
      </div>

      {!items.length ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 max-w-sm text-muted-foreground">
            Aucune conversation. Écris depuis la page d’un artisan pour démarrer un échange.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/compte/messages/${item.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
              >
                <div>
                  <p className="font-medium">{item.artisan_label}</p>
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
