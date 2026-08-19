import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { AppPageHeader } from "@/components/app/app-page-header";
import { ContactSettingsForm } from "@/components/settings/contact-settings-form";
import { EmbedWidgetCard } from "@/components/settings/embed-widget-card";
import { SubscriptionSettingsSection } from "@/components/settings/subscription-settings-section";
import { VoiceNumberForm } from "@/components/settings/voice-number-form";
import { SupabaseMissing } from "@/components/supabase-missing";
import { buttonVariants } from "@/components/ui/button-variants";
import { buildEmbedSnippet } from "@/lib/leads/embed";
import { getMarketingSiteUrl, getPublicSiteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ProfileForm } from "../profile/profile-form";
import { LegalSettingsForm } from "@/components/settings/legal-settings-form";
import { CreateServiceForm } from "../services/create-service-form";
import { ServiceRow } from "../services/service-row";

import { updateArtisanSettings } from "./actions";

const TABS = [
  { id: "activite", label: "Mon activité" },
  { id: "coordonnees", label: "Coordonnées" },
  { id: "facturation", label: "Facturation" },
  { id: "abonnement", label: "Abonnement" },
  { id: "prestations", label: "Prestations" },
  { id: "widget", label: "Widget" },
  { id: "vocal", label: "IA Vocale" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function parseTab(raw: string | undefined): TabId {
  if (
    raw === "coordonnees" ||
    raw === "facturation" ||
    raw === "abonnement" ||
    raw === "prestations" ||
    raw === "activite" ||
    raw === "widget" ||
    raw === "vocal"
  ) {
    return raw;
  }
  return "activite";
}

function SettingsGate() {
  return (
    <div className="rounded-2xl border border-warning/40 bg-warning/5 p-5 text-sm leading-relaxed">
      <p className="font-medium">Enregistre d’abord ton activité dans l’onglet « Mon activité ».</p>
      <Link
        href="/app/reglages?tab=activite"
        className="mt-3 inline-flex font-semibold underline underline-offset-4"
      >
        Aller à Mon activité
      </Link>
    </div>
  );
}

export default async function ArtisanSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Réglages indisponibles" />;
  }

  const sp = await searchParams;
  const tab = parseTab(typeof sp.tab === "string" ? sp.tab : undefined);
  const subscriptionAlerts = {
    reason: typeof sp.reason === "string" ? sp.reason : undefined,
    success: typeof sp.success === "string" ? sp.success : undefined,
    canceled: typeof sp.canceled === "string" ? sp.canceled : undefined,
  };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, name, business_name, description, logo_url, slug, accent_color, labor_rate_per_hour, trade_category, trade",
    )
    .eq("user_id", user!.id)
    .maybeSingle();

  let contact = {
    phone: null as string | null,
    address_line1: null as string | null,
    address_line2: null as string | null,
    postal_code: null as string | null,
    city: null as string | null,
    latitude: null as number | null,
    longitude: null as number | null,
  };

  if (profile?.id) {
    const contactRes = await supabase
      .from("profiles")
      .select("phone, address_line1, address_line2, postal_code, city, latitude, longitude")
      .eq("id", profile.id)
      .maybeSingle();
    if (!contactRes.error && contactRes.data) {
      contact = contactRes.data;
    }
  }

  // Colonne ajoutée par lead_qualification.sql : on reste tolérant si la
  // migration n'est pas encore passée.
  let leadMatchingEnabled = true;
  if (profile?.id) {
    const matchingRes = await supabase
      .from("profiles")
      .select("lead_matching_enabled")
      .eq("id", profile.id)
      .maybeSingle();
    if (!matchingRes.error && matchingRes.data) {
      leadMatchingEnabled = matchingRes.data.lead_matching_enabled ?? true;
    }
  }

  const { data: services } = profile?.id
    ? await supabase
        .from("services")
        .select("id, title, duration, price")
        .eq("artisan_id", profile.id)
        .order("title", { ascending: true })
    : { data: [] as { id: string; title: string; duration: number; price: number | null }[] };

  const { data: voiceNumber } = profile?.id
    ? await supabase
        .from("artisan_voice_numbers")
        .select("phone_e164")
        .eq("artisan_id", profile.id)
        .maybeSingle()
    : { data: null };

  const profileInitial = profile ?? {
    name: null,
    business_name: "",
    description: null,
    logo_url: null,
    slug: "",
    accent_color: null as string | null,
    labor_rate_per_hour: null as number | null,
    trade_category: null as string | null,
    trade: null as string | null,
  };

  let legalInitial = {
    siren: null as string | null,
    siret: null as string | null,
    vat_number: null as string | null,
    trade_register_number: null as string | null,
    decennale_insurer: null as string | null,
    decennale_policy_number: null as string | null,
    rc_pro_insurer: null as string | null,
    rc_pro_number: null as string | null,
    mediator_name: null as string | null,
    mediator_url: null as string | null,
    default_payment_terms_days: 30,
    default_retention_rate: 5,
    auto_reminder_enabled: true,
  };

  if (profile?.id) {
    const legalRes = await supabase
      .from("profiles")
      .select(
        "siren, siret, vat_number, trade_register_number, decennale_insurer, decennale_policy_number, rc_pro_insurer, rc_pro_number, mediator_name, mediator_url, default_payment_terms_days, default_retention_rate, auto_reminder_enabled",
      )
      .eq("id", profile.id)
      .maybeSingle();
    if (legalRes.data) {
      legalInitial = {
        siren: legalRes.data.siren,
        siret: legalRes.data.siret,
        vat_number: legalRes.data.vat_number,
        trade_register_number: legalRes.data.trade_register_number,
        decennale_insurer: legalRes.data.decennale_insurer,
        decennale_policy_number: legalRes.data.decennale_policy_number,
        rc_pro_insurer: legalRes.data.rc_pro_insurer,
        rc_pro_number: legalRes.data.rc_pro_number,
        mediator_name: legalRes.data.mediator_name,
        mediator_url: legalRes.data.mediator_url,
        default_payment_terms_days: legalRes.data.default_payment_terms_days ?? 30,
        default_retention_rate: Number(legalRes.data.default_retention_rate ?? 5),
        auto_reminder_enabled: legalRes.data.auto_reminder_enabled ?? true,
      };
    }
  }

  let subscriptionProfile = {
    subscription_plan: "base" as string,
    subscription_status: "trialing" as string,
    trial_ends_at: null as string | null,
    stripe_customer_id: null as string | null,
    stripe_subscription_id: null as string | null,
    voice_minutes_included: 0,
    voice_minutes_used: 0,
  };

  if (profile?.id) {
    const subscriptionRes = await supabase
      .from("profiles")
      .select(
        "subscription_plan, subscription_status, trial_ends_at, stripe_customer_id, stripe_subscription_id, voice_minutes_included, voice_minutes_used",
      )
      .eq("id", profile.id)
      .maybeSingle();
    if (subscriptionRes.data) {
      subscriptionProfile = {
        subscription_plan: subscriptionRes.data.subscription_plan ?? "base",
        subscription_status: subscriptionRes.data.subscription_status ?? "trialing",
        trial_ends_at: subscriptionRes.data.trial_ends_at,
        stripe_customer_id: subscriptionRes.data.stripe_customer_id,
        stripe_subscription_id: subscriptionRes.data.stripe_subscription_id,
        voice_minutes_included: subscriptionRes.data.voice_minutes_included ?? 0,
        voice_minutes_used: subscriptionRes.data.voice_minutes_used ?? 0,
      };
    }
  }

  return (
    <div className="space-y-8">
      <AppPageHeader
        eyebrow="Compte"
        title="Réglages"
        description="Activité, coordonnées, prestations et IA vocale — tout au même endroit."
        action={
          profile?.slug ? (
            <Link
              href={`/site/${profile.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "secondary", size: "lg", className: "gap-2" })}
            >
              Voir ma vitrine
              <ExternalLink className="size-4" />
            </Link>
          ) : null
        }
      />

      <nav
        className="app-surface flex gap-1 overflow-x-auto p-2"
        aria-label="Sections des réglages"
      >
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/app/reglages?tab=${t.id}`}
            className={cn(
              "min-h-11 shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
              tab === t.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="app-surface p-5 sm:p-8">
        {tab === "activite" ? (
          <section className="space-y-5">
            <div className="space-y-1">
              <h2 className="font-display text-xl font-semibold tracking-tight">Mon activité</h2>
              <p className="text-sm text-muted-foreground">
                Ce que les clients voient sur ta page vitrine : nom, description, couleur et taux horaire.
              </p>
            </div>
            <ProfileForm initialValues={profileInitial} />
          </section>
        ) : null}

        {tab === "coordonnees" ? (
          <section className="space-y-5">
            {!profile ? (
              <SettingsGate />
            ) : (
              <>
                <div className="space-y-1">
                  <h2 className="font-display text-xl font-semibold tracking-tight">Coordonnées</h2>
                  <p className="text-sm text-muted-foreground">
                    Téléphone et adresse postale pour tes devis et factures (informations privées).
                  </p>
                </div>
                <ContactSettingsForm
                  initialValues={{
                    displayName: profile.name ?? "",
                    email: user!.email ?? null,
                    phone: contact.phone,
                    addressLine1: contact.address_line1,
                    addressLine2: contact.address_line2,
                    postalCode: contact.postal_code,
                    city: contact.city,
                    latitude: contact.latitude,
                    longitude: contact.longitude,
                  }}
                  displayNameLabel="Nom du contact"
                  geocodeAddress
                  saveAction={updateArtisanSettings}
                />
              </>
            )}
          </section>
        ) : null}

        {tab === "facturation" ? (
          <section className="space-y-5">
            {!profile ? (
              <SettingsGate />
            ) : (
              <>
                <div className="space-y-1">
                  <h2 className="font-display text-xl font-semibold tracking-tight">Facturation & mentions légales</h2>
                  <p className="text-sm text-muted-foreground">
                    SIREN, TVA, assurances et paramètres de relance — affichés sur tes PDF devis et factures.
                  </p>
                </div>
                <LegalSettingsForm initialValues={legalInitial} />
              </>
            )}
          </section>
        ) : null}

        {tab === "abonnement" ? (
          !profile ? (
            <SettingsGate />
          ) : (
            <SubscriptionSettingsSection profile={subscriptionProfile} alerts={subscriptionAlerts} />
          )
        ) : null}

        {tab === "prestations" ? (
          <section className="space-y-8">
            {!profile ? (
              <SettingsGate />
            ) : (
              <>
                <div className="space-y-1">
                  <h2 className="font-display text-xl font-semibold tracking-tight">Prestations</h2>
                  <p className="text-sm text-muted-foreground">
                    Chaque prestation apparaît sur ta vitrine pour que les clients puissent réserver.
                  </p>
                </div>
                <CreateServiceForm disabled={false} />
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Liste
                  </h3>
                  {!services?.length ? (
                    <p className="rounded-2xl border border-dashed bg-muted/40 px-6 py-12 text-center text-sm text-muted-foreground">
                      Aucune prestation pour l’instant. Ajoute-en une ci-dessus.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {services.map((s) => (
                        <ServiceRow key={s.id} service={s} />
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </section>
        ) : null}

        {tab === "widget" ? (
          <section className="space-y-5">
            {!profile?.slug ? (
              <SettingsGate />
            ) : (
              <>
                <div className="space-y-1">
                  <h2 className="font-display text-xl font-semibold tracking-tight">
                    Widget d’estimation
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Un bouton sur ton site web : le visiteur décrit ses travaux, obtient une fourchette
                    de prix, et sa demande t’arrive directement.
                  </p>
                </div>
                <EmbedWidgetCard
                  slug={profile.slug}
                  snippet={buildEmbedSnippet(getPublicSiteUrl(), profile.slug, getMarketingSiteUrl())}
                  previewUrl={`/embed/${profile.slug}`}
                  matchingEnabled={leadMatchingEnabled}
                />
              </>
            )}
          </section>
        ) : null}

        {tab === "vocal" ? (
          <section className="space-y-5">
            {!profile ? (
              <SettingsGate />
            ) : (
              <>
                <div className="space-y-1">
                  <h2 className="font-display text-xl font-semibold tracking-tight">IA Vocale</h2>
                  <p className="text-sm text-muted-foreground">
                    Active l’IA vocale pour recevoir des appels et des demandes de RDV.
                  </p>
                </div>
                <VoiceNumberForm initialPhone={voiceNumber?.phone_e164 ?? null} />
              </>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
