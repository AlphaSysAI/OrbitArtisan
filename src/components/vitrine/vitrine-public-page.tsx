import Image from "next/image";
import Link from "next/link";
import { CalendarCheck, Clock, MapPin, ShieldCheck, Sparkles } from "lucide-react";

import type { TradeSelection } from "@/components/trades/trade-picker";
import { VitrineEstimationSection } from "@/components/vitrine/vitrine-estimation-section";

import { BookAppointmentForm } from "@/app/site/[slug]/book-appointment-form";
import { getMarketingHomeHref } from "@/lib/site-url";
import { type VitrineOwnerAppointment, VitrineOwnerCalendar } from "@/components/vitrine/vitrine-owner-calendar";
import { shadeAccent } from "@/lib/vitrine-theme";

type Profile = {
  id: string;
  name: string | null;
  business_name: string;
  description: string | null;
  logo_url: string | null;
  slug: string;
  sales_terms_text?: string | null;
};

type Service = {
  id: string;
  title: string;
  duration: number;
  price: number | null;
};

export type VitrineGalleryItem = {
  id: string;
  url: string;
  caption: string | null;
};

function formatPrice(price: number | null) {
  if (price == null) return "Sur devis";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(price / 100);
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function VitrinePublicPage({
  profile,
  services,
  gallery,
  accent,
  demoMode,
  viewerUserId,
  isOwner,
  ownerAppointments = [],
  estimationEnabled = false,
  presetTrade = null,
}: {
  profile: Profile;
  services: Service[];
  gallery: VitrineGalleryItem[];
  accent: string;
  demoMode: boolean;
  viewerUserId: string | null;
  isOwner: boolean;
  ownerAppointments?: VitrineOwnerAppointment[];
  estimationEnabled?: boolean;
  presetTrade?: TradeSelection | null;
}) {
  const accentMuted = shadeAccent(accent, 0.12);
  const accentDark = shadeAccent(accent, 0.28);
  const heroImage = gallery[0]?.url ?? null;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {isOwner && !demoMode ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
          Vue artisan — c&apos;est ce que vos clients voient sur votre vitrine publique.
        </div>
      ) : null}

      <header className="border-b border-neutral-200/80 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-4">
            {profile.logo_url ? (
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
                <Image src={profile.logo_url} alt="" fill className="object-contain p-1" sizes="56px" unoptimized />
              </div>
            ) : (
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white"
                style={{ backgroundColor: accent }}
              >
                {profile.business_name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Artisan professionnel</p>
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{profile.business_name}</h1>
              {profile.name ? <p className="text-sm text-neutral-600">{profile.name}</p> : null}
            </div>
          </div>
          {!isOwner ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {estimationEnabled ? (
                <a
                  href="#estimation"
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow-sm transition-colors hover:bg-neutral-50"
                >
                  <Sparkles className="size-4" style={{ color: accent }} />
                  Demander une estimation
                </a>
              ) : null}
              <a
                href="#rdv"
                className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95"
                style={{ backgroundColor: accent }}
              >
                <CalendarCheck className="size-4" />
                Prendre rendez-vous
              </a>
            </div>
          ) : null}
        </div>
      </header>

      <section className="border-b border-neutral-200/80 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-2 lg:items-center lg:py-16">
          <div className="space-y-6">
            <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              {profile.business_name}
            </h2>
            <p className="max-w-xl text-lg leading-relaxed text-neutral-600">
              {profile.description?.trim() ||
                "Artisan du bâtiment : intervention soignée, devis clairs et suivi de votre projet de A à Z."}
            </p>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-600">
              <li className="inline-flex items-center gap-2">
                <ShieldCheck className="size-4 shrink-0" style={{ color: accent }} />
                Devis & factures conformes
              </li>
              <li className="inline-flex items-center gap-2">
                <Clock className="size-4 shrink-0" style={{ color: accent }} />
                Créneaux en ligne
              </li>
              <li className="inline-flex items-center gap-2">
                <MapPin className="size-4 shrink-0" style={{ color: accent }} />
                Intervention locale
              </li>
            </ul>
          </div>
          {heroImage ? (
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 shadow-md">
              <Image src={heroImage} alt="" fill className="object-cover" sizes="(max-width:1024px) 100vw, 50vw" priority unoptimized />
            </div>
          ) : (
            <div
              className="flex aspect-[4/3] items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-100/80 text-sm text-neutral-500"
              style={{ borderColor: `${accent}44` }}
            >
              {isOwner ? "Ajoutez des photos dans Réglages → Mon activité." : null}
            </div>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-16 px-5 py-14 sm:px-8 sm:py-16">
        {gallery.length > 1 ? (
          <section className="space-y-6">
            <div>
              <h3 className="text-2xl font-semibold tracking-tight">Réalisations &amp; chantiers</h3>
              <p className="mt-1 text-neutral-600">Quelques photos pour vous donner une idée du sérieux de l&apos;intervention.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {gallery.slice(heroImage ? 1 : 0).map((item) => (
                <figure
                  key={item.id}
                  className="relative aspect-[4/3] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm"
                >
                  <Image src={item.url} alt={item.caption ?? ""} fill className="object-cover" sizes="400px" unoptimized />
                  {item.caption ? (
                    <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 text-xs text-white">
                      {item.caption}
                    </figcaption>
                  ) : null}
                </figure>
              ))}
            </div>
          </section>
        ) : null}

        {services.length > 0 ? (
          <section className="space-y-6">
            <div>
              <h3 className="text-2xl font-semibold tracking-tight">Prestations</h3>
              <p className="mt-1 text-neutral-600">Durées indicatives et tarifs affichés avant réservation.</p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((service) => (
                <li
                  key={service.id}
                  className="flex flex-col rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
                  style={{ borderTopWidth: 3, borderTopColor: accentMuted }}
                >
                  <p className="font-semibold text-neutral-900">{service.title}</p>
                  <p className="mt-2 text-sm text-neutral-600">{formatDuration(service.duration)}</p>
                  <p className="mt-auto pt-4 text-lg font-semibold tabular-nums" style={{ color: accentDark }}>
                    {formatPrice(service.price)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {estimationEnabled ? (
          <section id="estimation" className="scroll-mt-8 space-y-6">
            <div>
              <h3 className="text-2xl font-semibold tracking-tight">Demander une estimation</h3>
              <p className="mt-1 text-neutral-600">
                Décrivez votre besoin en quelques minutes : fourchette de prix indicative et prise en charge par{" "}
                {profile.business_name}.
                {isOwner && !demoMode ? " (Même formulaire que sur votre widget intégrable.)" : null}
              </p>
            </div>
            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="border-b border-neutral-100 px-4 py-3 sm:px-6">
                <p className="text-sm font-medium text-neutral-900">{profile.business_name}</p>
                <p className="text-xs text-neutral-500">
                  {presetTrade ? `${presetTrade.tradeLabel} · estimation gratuite` : "Estimation gratuite"}
                </p>
              </div>
              <div className="p-4 sm:p-6">
                <VitrineEstimationSection
                  slug={profile.slug}
                  businessName={profile.business_name}
                  presetTrade={presetTrade}
                />
              </div>
            </div>
          </section>
        ) : isOwner && !demoMode ? (
          <section className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-100/60 px-5 py-8 text-center text-sm text-neutral-600">
            Le widget d&apos;estimation est désactivé dans{" "}
            <span className="font-medium text-neutral-800">Réglages → Widget</span>. Activez-le pour l&apos;afficher ici
            et sur les sites où vous intégrez le script.
          </section>
        ) : null}

        <section id="rdv" className="scroll-mt-8 space-y-6">
          <div>
            <h3 className="text-2xl font-semibold tracking-tight">
              {isOwner && !demoMode ? "Vos rendez-vous vitrine" : "Réserver un créneau"}
            </h3>
            <p className="mt-1 text-neutral-600">
              {isOwner && !demoMode
                ? "Calendrier des réservations reçues via cette page."
                : "Choisissez une prestation et un horaire disponible."}
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            {isOwner && !demoMode ? (
              <div className="p-4 sm:p-6">
                <VitrineOwnerCalendar appointments={ownerAppointments} services={services} accentColor={accent} />
              </div>
            ) : (
              <div className="p-4 sm:p-6">
                <BookAppointmentForm
                  artisanId={profile.id}
                  slug={profile.slug}
                  services={services}
                  demoMode={demoMode}
                  accentColor={accent}
                  viewerUserId={viewerUserId}
                />
              </div>
            )}
          </div>
        </section>

        <footer className="border-t border-neutral-200 pt-10 text-center text-sm text-neutral-500">
          {profile.sales_terms_text?.trim() ? (
            <p className="mb-3">
              <Link
                href={`/site/${profile.slug}/cgv`}
                className="font-medium underline-offset-4 hover:underline"
                style={{ color: accentDark }}
              >
                Conditions générales de vente
              </Link>
            </p>
          ) : null}
          <p>
            Page professionnelle propulsée par{" "}
            <Link href={getMarketingHomeHref()} className="font-medium underline-offset-4 hover:underline" style={{ color: accentDark }}>
              Soline
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
