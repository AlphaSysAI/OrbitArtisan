import Link from "next/link";

import { ContactSettingsForm } from "@/components/settings/contact-settings-form";
import { VoiceNumberForm } from "@/components/settings/voice-number-form";
import { SupabaseMissing } from "@/components/supabase-missing";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ProfileForm } from "../profile/profile-form";
import { CreateServiceForm } from "../services/create-service-form";
import { ServiceRow } from "../services/service-row";

import { updateArtisanSettings } from "./actions";

const TABS = [
  { id: "activite", label: "Mon activité" },
  { id: "coordonnees", label: "Coordonnées" },
  { id: "prestations", label: "Prestations" },
  { id: "vocal", label: "IA Vocale" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function parseTab(raw: string | undefined): TabId {
  if (raw === "coordonnees" || raw === "prestations" || raw === "activite" || raw === "vocal") return raw;
  return "activite";
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

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, business_name, description, logo_url, slug, accent_color, labor_rate_per_hour, trade_category, trade")
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

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Compte</p>
          <h1 className="text-2xl font-semibold tracking-tight">Réglages</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Activité, coordonnées et prestations — tout au même endroit.
          </p>
        </div>
        {profile?.slug ? (
          <Link
            href={`/site/${profile.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Voir ma page vitrine
          </Link>
        ) : null}
      </div>

      <nav className="flex flex-wrap gap-2 border-b pb-1" aria-label="Sections des réglages">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/app/reglages?tab=${t.id}`}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "activite" ? (
        <section className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Ce que les clients voient sur ta page vitrine : nom, description, couleur et taux horaire.
          </p>
          <ProfileForm initialValues={profileInitial} />
        </section>
      ) : null}

      {tab === "coordonnees" ? (
        <section className="space-y-4">
          {!profile ? (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-4 text-sm">
              <p className="font-medium text-amber-950 dark:text-amber-100">
                Enregistre d’abord ton activité dans l’onglet « Mon activité ».
              </p>
              <Link
                href="/app/reglages?tab=activite"
                className="mt-2 inline-block font-medium underline underline-offset-4"
              >
                Aller à Mon activité
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Téléphone et adresse postale pour tes devis et factures (informations privées).
              </p>
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

      {tab === "prestations" ? (
        <section className="space-y-8">
          {!profile ? (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-4 text-sm">
              <p className="font-medium text-amber-950 dark:text-amber-100">
                Enregistre d’abord ton activité dans l’onglet « Mon activité ».
              </p>
              <Link
                href="/app/reglages?tab=activite"
                className="mt-2 inline-block font-medium underline underline-offset-4"
              >
                Aller à Mon activité
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Chaque prestation apparaît sur ta vitrine pour que les clients puissent réserver.
              </p>
              <CreateServiceForm disabled={false} />
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Liste</h2>
                {!services?.length ? (
                  <p className="rounded-2xl border border-dashed bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
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

      {tab === "vocal" ? (
        <section className="space-y-4">
          {!profile ? (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-4 text-sm">
              <p className="font-medium text-amber-950 dark:text-amber-100">
                Enregistre d'abord ton activité dans l'onglet « Mon activité ».
              </p>
              <Link
                href="/app/reglages?tab=activite"
                className="mt-2 inline-block font-medium underline underline-offset-4"
              >
                Aller à Mon activité
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Active l'IA vocale pour recevoir des appels et des demandes de RDV.
              </p>
              <VoiceNumberForm initialPhone={voiceNumber?.phone_e164 ?? null} />
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
