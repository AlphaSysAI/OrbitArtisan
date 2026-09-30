import Link from "next/link";
import { Search, Users } from "lucide-react";

import { AppEmptyState } from "@/components/app/app-empty-state";
import { AppListItem } from "@/components/app/app-list-item";
import { AppPageHeader } from "@/components/app/app-page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { SupabaseMissing } from "@/components/supabase-missing";
import { requireArtisanProfileIdOrRedirect } from "@/lib/auth/require-artisan";
import { listArtisanContacts } from "@/lib/contacts/actions";
import { formatContactDisplayName } from "@/lib/contacts/display-name";
import { ilikeOrPattern } from "@/lib/security/postgrest-filter";

import { CancelInvitationButton } from "../contacts/cancel-invitation-button";
import { NewClientDialog } from "./new-client-dialog";

function nationalPhone(p: string | null) {
  if (!p) return null;
  return p.startsWith("+33") ? `0${p.slice(3)}`.replace(/(\d{2})(?=\d)/g, "$1 ") : p;
}

function relative(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 30) return `il y a ${days} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Clients indisponibles" />;
  }
  const { supabase, profileId } = await requireArtisanProfileIdOrRedirect([], "/login?next=/app/clients");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);

  let query = supabase
    .from("clients")
    .select("id, display_name, phone, email, customer_user_id, last_activity_at")
    .eq("artisan_id", profileId)
    .order("last_activity_at", { ascending: false })
    .limit(200);
  if (q) {
    const digits = q.replace(/[\s.\-()]/g, "");
    if (/^\+?\d{2,}$/.test(digits)) {
      const core = digits.replace(/^\+?33/, "").replace(/^0/, "");
      query = query.ilike("phone", `%${core}%`);
    } else {
      const p = ilikeOrPattern(q);
      query = query.or(`display_name.ilike.${p},email.ilike.${p}`);
    }
  }

  const nowIso = new Date().toISOString();
  const [{ data: clients }, { data: calls }, { data: callbacks }, { data: appts }, contacts] = await Promise.all([
    query,
    supabase.from("voice_call_intakes").select("client_id").eq("artisan_id", profileId).eq("status", "pending_review"),
    supabase
      .from("quotes")
      .select("client_id")
      .eq("artisan_id", profileId)
      .not("callback_requested_at", "is", null)
      .is("callback_handled_at", null),
    supabase.from("appointments").select("client_id").eq("artisan_id", profileId).eq("status", "pending").gt("start_time", nowIso),
    listArtisanContacts(),
  ]);

  const todoByClient = new Map<string, number>();
  for (const row of [...(calls ?? []), ...(callbacks ?? []), ...(appts ?? [])]) {
    if (row.client_id) todoByClient.set(row.client_id as string, (todoByClient.get(row.client_id as string) ?? 0) + 1);
  }
  const pendingInvites = contacts.ok ? contacts.items.filter((i) => i.kind === "pending") : [];
  const list = clients ?? [];

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Clients"
        title="Mes clients"
        description="Chaque client a sa fiche : appels, messages, devis, factures et rendez-vous au même endroit."
        action={<NewClientDialog />}
      />

      <form action="/app/clients" method="get" role="search" className="flex gap-2">
        <label htmlFor="clients-q" className="sr-only">
          Rechercher un client
        </label>
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="clients-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Nom, téléphone ou e-mail"
            className="h-11 w-full rounded-md border border-input bg-transparent pl-9 pr-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
          />
        </div>
        <button type="submit" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Chercher
        </button>
      </form>

      {list.length === 0 ? (
        <AppEmptyState
          icon={Users}
          title={q ? "Aucun client trouvé" : "Aucun client pour l'instant"}
          description={
            q
              ? "Essaie avec un autre nom ou numéro."
              : "Tes clients apparaissent ici automatiquement dès un appel Soline, une demande de RDV, un message ou un devis."
          }
        />
      ) : (
        <ul className="space-y-2">
          {list.map((c) => {
            const todo = todoByClient.get(c.id as string) ?? 0;
            return (
              <li key={c.id as string}>
                <AppListItem
                  href={`/app/clients/${c.id}`}
                  title={c.display_name as string}
                  subtitle={[nationalPhone(c.phone as string | null), c.email, `activité ${relative(c.last_activity_at as string)}`]
                    .filter(Boolean)
                    .join(" · ")}
                  meta={
                    <>
                      {todo > 0 ? <Badge className="bg-amber-500 text-white hover:bg-amber-500">{todo} à traiter</Badge> : null}
                      {c.customer_user_id ? <Badge variant="secondary">Compte Soline</Badge> : null}
                    </>
                  }
                  emphasis={todo > 0 ? "warning" : "default"}
                />
              </li>
            );
          })}
        </ul>
      )}

      {pendingInvites.length ? (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold tracking-tight">Invitations en attente</h2>
          <ul className="space-y-2">
            {pendingInvites.map((item) => (
              <li key={item.id}>
                <AppListItem
                  title={formatContactDisplayName({ name: item.invitedName, email: item.email, fallback: item.email })}
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

      <p className="text-center text-xs text-muted-foreground">
        <Link href="/app/messages" className="underline underline-offset-4">
          Toutes les conversations
        </Link>
        {" · "}
        <Link href="/app/appels" className="underline underline-offset-4">
          Tous les appels Soline
        </Link>
      </p>
    </div>
  );
}
