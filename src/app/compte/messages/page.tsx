import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SupabaseMissing } from "@/components/supabase-missing";
import { claimLeadByToken } from "@/lib/leads/client-signup";
import { listConversationsForCustomer } from "@/lib/messages/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ClientMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ claimLead?: string; success?: string }>;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Messages indisponibles" />;
  }

  const sp = await searchParams;
  const claimLead = typeof sp.claimLead === "string" ? sp.claimLead.trim() : "";
  const success = typeof sp.success === "string" ? sp.success : undefined;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = claimLead
      ? `/compte/messages?claimLead=${encodeURIComponent(claimLead)}`
      : "/compte/messages";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  let claimError: string | null = null;
  if (claimLead) {
    const claim = await claimLeadByToken(claimLead);
    if (!claim.ok && claim.error === "email_mismatch") {
      claimError = "email_mismatch";
    }
  }

  const res = await listConversationsForCustomer();
  const items = res.ok ? res.items : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tes conversations avec les artisans.</p>
      </div>

      {success === "lead" && (
        <Alert>
          <AlertTitle>Compte relié à ta demande</AlertTitle>
          <AlertDescription>
            Tes échanges avec les artisans apparaissent ci-dessous. Rappel : les montants affichés
            restent des estimations indicatives, non engageantes.
          </AlertDescription>
        </Alert>
      )}

      {claimError === "email_mismatch" && (
        <Alert variant="destructive">
          <AlertTitle>E-mail différent</AlertTitle>
          <AlertDescription>
            Connecte-toi avec la même adresse e-mail que celle utilisée lors de l’estimation pour
            retrouver ta demande.
          </AlertDescription>
        </Alert>
      )}

      {!items.length ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 max-w-sm text-muted-foreground">
            {claimLead
              ? "Aucune conversation visible pour l’instant. Les artisans te recontactent bientôt — reviens ici dans quelques heures."
              : "Aucune conversation. Écris depuis la page d’un artisan pour démarrer un échange."}
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
