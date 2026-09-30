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

import { CallForwardingMobileCard } from "@/components/app/call-forwarding-mobile-card";
import { SolineCallsPromoLink } from "@/components/app/soline-calls-promo-link";
import { AppEmptyState } from "@/components/app/app-empty-state";
import { AppPageHeader } from "@/components/app/app-page-header";
import { DashboardStatCard } from "@/components/app/dashboard-stat-card";
import { StepCard } from "@/components/app/step-card";
import { VitrineShareButton } from "@/components/app/vitrine-share-button";
import { buttonVariants } from "@/components/ui/button-variants";
import { SupabaseMissing } from "@/components/supabase-missing";
import { loadArtisanInbox, type InboxItem } from "@/lib/clients/inbox";
import { InboxList } from "@/components/app/inbox-list";
import { getCurrentUser, getRequestSupabase } from "@/lib/auth/session";

function formatEur(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export default async function AppHomePage({ searchParams }: { searchParams: Promise<{ bienvenue?: string }> }) {
  const welcome = (await searchParams).bienvenue === "1";
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Espace artisan indisponible" />;
  }

  // Perf (refacto latence, point 6) : session en cache par requête, puis tous
  // les compteurs du tableau de bord en une seule vague parallèle (avant :
  // prestations → contacts → compteurs, en séquence).
  const [supabase, user] = await Promise.all([getRequestSupabase(), getCurrentUser()]);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, business_name, slug")
    .eq("user_id", user!.id)
    .maybeSingle();

  let solinePhoneE164: string | null = null;
  let serviceCount: number | null = 0;
  let contactCount = 0;
  let finalizedInvoiceCount = 0;
  let revenueCents = 0;
  let pendingQuoteCount = 0;
  let pendingPaymentCount = 0;
  let inbox: InboxItem[] = [];

  if (profile?.id) {
    const [
      { count: services },
      contactsRes,
      { count: finalizedCount },
      { count: pendingQuotes },
      { count: pendingPayments },
      { data: revenueAgg },
      voiceNumberRes,
    ] = await Promise.all([
      supabase.from("services").select("id", { count: "exact", head: true }).eq("artisan_id", profile.id),
      supabase.from("clients").select("id", { count: "exact", head: true }).eq("artisan_id", profile.id),
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
      supabase
        .from("invoices")
        .select("grand_total.sum()")
        .eq("artisan_id", profile.id)
        .eq("status", "paid"),
      supabase.from("artisan_voice_numbers").select("phone_e164").eq("artisan_id", profile.id).maybeSingle(),
    ]);

    solinePhoneE164 = (voiceNumberRes.data?.phone_e164 as string | undefined) ?? null;
    serviceCount = services;
    contactCount = contactsRes.count ?? 0;
    inbox = await loadArtisanInbox(supabase, profile.id, user!.id);
    finalizedInvoiceCount = finalizedCount ?? 0;
    pendingQuoteCount = pendingQuotes ?? 0;
    pendingPaymentCount = pendingPayments ?? 0;
    revenueCents = revenueAgg?.[0]?.sum ?? 0;
  }

  const hasProfile = !!profile;
  const hasServices = (serviceCount ?? 0) > 0;
  const showOnboarding = !hasProfile || !hasServices;
  const greetingName = hasProfile ? profile!.business_name : "Bienvenue";

  return (
    <div className="space-y-10">
      <AppPageHeader
        eyebrow={hasProfile ? greetingName : undefined}
        title={hasProfile ? "À traiter" : "Bienvenue"}
        description={
          hasProfile
            ? inbox.length
              ? `${inbox.length} action${inbox.length > 1 ? "s" : ""} en attente, les plus urgentes en premier.`
              : "Tout est à jour. Les nouveaux appels, messages et réponses de devis arriveront ici."
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

      {hasProfile && welcome ? (
        <section className="space-y-3 rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/5 p-4">
          <p className="font-semibold">Ton compte est prêt. Dernière étape, 10 secondes :</p>
          <p className="text-sm text-muted-foreground">
            Active le renvoi d&apos;appel : quand tu ne décroches pas, Soline répond, prend le besoin et te prépare le devis.
          </p>
          <CallForwardingMobileCard solinePhoneE164={solinePhoneE164} className="border-0 bg-transparent p-0 lg:block" />
        </section>
      ) : null}

      {hasProfile ? <InboxList items={inbox} /> : null}

      {hasProfile ? (
        <SolineCallsPromoLink variant="banner" />
      ) : null}

      {hasProfile ? (
        <CallForwardingMobileCard solinePhoneE164={solinePhoneE164} />
      ) : null}

      {hasProfile ? (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-display text-xl font-semibold tracking-tight">Chiffres clés</h2>
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
              title="Clients"
              value={String(contactCount)}
              description={contactCount === 1 ? "Fiche client" : "Fiches clients"}
              href="/app/clients"
              actionLabel="Voir les clients"
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
          <div className="flex flex-wrap gap-2 shrink-0">
            <VitrineShareButton slug={profile!.slug} businessName={profile!.business_name} />
            <Link
              href={`/site/${profile!.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "secondary", size: "lg", className: "gap-2" })}
            >
              Ouvrir la vitrine
              <ExternalLink className="size-4" />
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
