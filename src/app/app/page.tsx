import Link from "next/link";
import {
  BriefcaseBusiness,
  Clock,
  ExternalLink,
  Euro,
  FileText,
  Plus,
  Receipt,
  Sparkles,
  Store,
  Users,
} from "lucide-react";

import { AppEmptyState } from "@/components/app/app-empty-state";
import { AppPageHeader } from "@/components/app/app-page-header";
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
  const greetingName = hasProfile ? profile!.business_name : "Bienvenue";

  return (
    <div className="space-y-10">
      <AppPageHeader
        eyebrow="Tableau de bord"
        title={greetingName}
        description={
          hasProfile
            ? "Ce qui compte aujourd’hui : clients, devis, factures et encaissements."
            : "Trois étapes pour être en ligne : activité, prestations, puis ton lien à partager."
        }
        action={
          hasProfile ? (
            <Link
              href="/app/quotes/new"
              className={buttonVariants({ size: "lg", className: "gap-2 shadow-sm" })}
            >
              <Plus className="size-4" />
              Nouveau devis
            </Link>
          ) : (
            <Link
              href="/app/reglages?tab=activite"
              className={buttonVariants({ size: "lg", className: "gap-2" })}
            >
              <Sparkles className="size-4" />
              Commencer
            </Link>
          )
        }
      />

      {hasProfile ? (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-display text-xl font-semibold tracking-tight">Vue d’ensemble</h2>
            <p className="text-sm text-muted-foreground">Touche une carte pour ouvrir</p>
          </div>

          <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <DashboardStatCard
              icon={Euro}
              title="Revenus encaissés"
              value={formatEur(revenueCents)}
              description="Total des factures payées"
              href="/app/invoices"
              actionLabel="Voir les factures"
              highlight="success"
              className="sm:col-span-2 xl:col-span-2 xl:row-span-2 xl:min-h-[280px]"
            />
            <DashboardStatCard
              icon={FileText}
              title="Devis en attente"
              value={String(pendingQuoteCount)}
              description="En attente de réponse client"
              href="/app/quotes"
              actionLabel="Voir les devis"
              highlight={pendingQuoteCount > 0 ? "warning" : "default"}
              className="xl:col-span-2"
            />
            <DashboardStatCard
              icon={Clock}
              title="Paiements en attente"
              value={String(pendingPaymentCount)}
              description="Factures envoyées, pas encore payées"
              href="/app/invoices"
              actionLabel="Relancer le paiement"
              highlight={pendingPaymentCount > 0 ? "warning" : "default"}
              className="xl:col-span-2"
            />
            <DashboardStatCard
              icon={Users}
              title="Contacts"
              value={String(contactCount)}
              description={contactCount === 1 ? "Client lié" : "Clients liés"}
              href="/app/contacts"
              actionLabel="Voir les contacts"
              className="xl:col-span-2"
            />
            <DashboardStatCard
              icon={Receipt}
              title="Factures finalisées"
              value={String(finalizedInvoiceCount)}
              description="Envoyées ou payées"
              href="/app/invoices"
              actionLabel="Voir les factures"
              className="xl:col-span-2"
            />
          </div>
        </section>
      ) : (
        <AppEmptyState
          icon={BriefcaseBusiness}
          title="Ton atelier n’est pas encore configuré"
          description="Renseigne ton activité pour débloquer devis, factures, rendez-vous et vitrine."
          action={
            <Link href="/app/reglages?tab=activite" className={buttonVariants({ size: "lg" })}>
              Configurer mon activité
            </Link>
          }
        />
      )}

      {showOnboarding ? (
        <section className="space-y-4">
          <h2 className="font-display text-xl font-semibold tracking-tight">Mise en route</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <StepCard
              step={1}
              icon={BriefcaseBusiness}
              title="Mon activité"
              description="Nom, description et adresse web de ta page."
              done={hasProfile}
              href="/app/reglages?tab=activite"
              actionLabel={hasProfile ? "Modifier" : "Remplir"}
            />
            <StepCard
              step={2}
              icon={Store}
              title="Mes prestations"
              description="Durée et prix affichés sur ta vitrine."
              done={hasServices}
              href="/app/reglages?tab=prestations"
              actionLabel={hasServices ? "Gérer" : "Ajouter"}
            />
            <StepCard
              step={3}
              icon={ExternalLink}
              title="Ma page publique"
              description="Le lien à envoyer à tes clients."
              done={hasProfile && hasServices}
              href={hasProfile ? `/site/${profile!.slug}` : "/app/reglages?tab=activite"}
              actionLabel="Voir la page"
            />
          </div>
        </section>
      ) : null}

      {hasProfile ? (
        <section className="app-surface flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Vitrine
            </p>
            <p className="font-display text-xl font-semibold tracking-tight">Lien de ta page</p>
            <p className="font-mono text-sm text-muted-foreground">/site/{profile!.slug}</p>
          </div>
          <Link
            href={`/site/${profile!.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "secondary", size: "lg", className: "gap-2 shrink-0" })}
          >
            Ouvrir la vitrine
            <ExternalLink className="size-4" />
          </Link>
        </section>
      ) : null}
    </div>
  );
}
