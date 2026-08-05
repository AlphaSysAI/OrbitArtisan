import Link from "next/link";
import { Clock, ExternalLink, Euro, FileText, Receipt, Users } from "lucide-react";

import { DashboardStatCard } from "@/components/app/dashboard-stat-card";
import { StepCard } from "@/components/app/step-card";
import { buttonVariants } from "@/components/ui/button-variants";
import { SupabaseMissing } from "@/components/supabase-missing";
import { listArtisanContacts } from "@/lib/contacts/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function formatEur(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export default async function AppHomePage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Espace artisan indisponible" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, business_name, slug")
    .eq("user_id", user!.id)
    .maybeSingle();

  const { count: serviceCount } = profile?.id
    ? await supabase
        .from("services")
        .select("id", { count: "exact", head: true })
        .eq("artisan_id", profile.id)
    : { count: 0 };

  const hasProfile = !!profile;
  const hasServices = (serviceCount ?? 0) > 0;

  let contactCount = 0;
  let finalizedInvoiceCount = 0;
  let revenueCents = 0;
  let pendingQuoteCount = 0;
  let pendingPaymentCount = 0;

  if (profile?.id) {
    const contactsRes = await listArtisanContacts();
    if (contactsRes.ok) {
      contactCount = contactsRes.items.filter((i) => i.kind === "linked").length;
    }

    const [
      { count: finalizedCount },
      { count: pendingQuotes },
      { count: pendingPayments },
      { data: paidInvoices },
    ] = await Promise.all([
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("artisan_id", profile.id)
        .in("status", ["sent", "paid"]),
      supabase
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .eq("artisan_id", profile.id)
        .eq("status", "sent"),
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("artisan_id", profile.id)
        .eq("status", "sent"),
      supabase.from("invoices").select("grand_total").eq("artisan_id", profile.id).eq("status", "paid"),
    ]);

    finalizedInvoiceCount = finalizedCount ?? 0;
    pendingQuoteCount = pendingQuotes ?? 0;
    pendingPaymentCount = pendingPayments ?? 0;
    revenueCents = (paidInvoices ?? []).reduce((sum, row) => sum + (row.grand_total ?? 0), 0);
  }

  const showOnboarding = !hasProfile || !hasServices;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {hasProfile ? profile!.business_name : "Bienvenue"}
        </h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          {hasProfile
            ? "Vue d’ensemble de ton activité : clients, devis, factures et encaissements."
            : "Trois étapes pour être en ligne : activité, prestations, puis ton lien à partager."}
        </p>
      </div>

      {hasProfile ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Tableau de bord</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <DashboardStatCard
              icon={Users}
              title="Contacts"
              value={String(contactCount)}
              description={
                contactCount === 1 ? "Client lié à ton activité" : "Clients liés à ton activité"
              }
              href="/app/contacts"
              actionLabel="Voir les contacts"
            />
            <DashboardStatCard
              icon={Receipt}
              title="Factures finalisées"
              value={String(finalizedInvoiceCount)}
              description="Envoyées ou payées (hors brouillon)"
              href="/app/invoices"
              actionLabel="Voir les factures"
            />
            <DashboardStatCard
              icon={Euro}
              title="Revenus encaissés"
              value={formatEur(revenueCents)}
              description="Total des factures payées"
              href="/app/invoices"
              actionLabel="Détail des factures"
              highlight="success"
            />
            <DashboardStatCard
              icon={FileText}
              title="Devis en attente"
              value={String(pendingQuoteCount)}
              description="En attente de réponse client"
              href="/app/quotes"
              actionLabel="Voir les devis"
              highlight={pendingQuoteCount > 0 ? "warning" : "default"}
            />
            <DashboardStatCard
              icon={Clock}
              title="Paiements en attente"
              value={String(pendingPaymentCount)}
              description="Factures envoyées, pas encore payées"
              href="/app/invoices"
              actionLabel="Relancer le paiement"
              highlight={pendingPaymentCount > 0 ? "warning" : "default"}
            />
          </div>
        </section>
      ) : null}

      {showOnboarding ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Mise en route</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <StepCard
              step={1}
              title="Mon activité"
              description="Nom, description et adresse web de ta page."
              done={hasProfile}
              href="/app/reglages?tab=activite"
              actionLabel={hasProfile ? "Modifier" : "Remplir"}
            />
            <StepCard
              step={2}
              title="Mes prestations"
              description="Durée et prix affichés sur ta vitrine."
              done={hasServices}
              href="/app/reglages?tab=prestations"
              actionLabel={hasServices ? "Gérer" : "Ajouter"}
            />
            <StepCard
              step={3}
              title="Ma page publique"
              description="Le lien à envoyer à tes clients."
              done={hasProfile && hasServices}
              href={hasProfile ? `/site/${profile!.slug}` : "/app/reglages?tab=activite"}
              actionLabel="Voir la page"
            />
          </div>
        </section>
      ) : null}

      {hasProfile && (
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed bg-muted/30 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Lien de ta vitrine</p>
            <p className="mt-1 font-mono text-sm text-foreground">/site/{profile!.slug}</p>
          </div>
          <Link
            href={`/site/${profile!.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "secondary", className: "gap-2 shrink-0" })}
          >
            Ouvrir <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        <Link className="underline-offset-4 hover:underline" href="/">
          Retour au site Orbit Artisan
        </Link>
      </p>
    </div>
  );
}
