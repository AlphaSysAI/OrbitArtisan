import Image from "next/image";
import Link from "next/link";
import { CalendarHeart, Handshake, Heart, Sparkles } from "lucide-react";

import { BookAppointmentForm } from "@/app/site/[slug]/book-appointment-form";
import { type VitrineOwnerAppointment, VitrineOwnerCalendar } from "@/components/vitrine/vitrine-owner-calendar";
import { VitrineMessages } from "@/components/vitrine/vitrine-messages";
import { heroGradientTop, shadeAccent } from "@/lib/vitrine-theme";

type Profile = {
  id: string;
  name: string | null;
  business_name: string;
  description: string | null;
  logo_url: string | null;
  slug: string;
};

type Service = {
  id: string;
  title: string;
  duration: number;
  price: number | null;
};

export function VitrinePublicPage({
  profile,
  services,
  accent,
  demoMode,
  viewerUserId,
  isOwner,
  ownerAppointments = [],
}: {
  profile: Profile;
  services: Service[];
  accent: string;
  demoMode: boolean;
  viewerUserId: string | null;
  isOwner: boolean;
  ownerAppointments?: VitrineOwnerAppointment[];
}) {
  const accentDark = shadeAccent(accent, 0.25);
  const firstName = profile.name?.split(/\s+/)[0];

  return (
    <div className="min-h-screen bg-[#fffbf7] text-neutral-900">
      <div
        className="h-2 w-full"
        style={{ background: `linear-gradient(90deg, ${accent} 0%, ${shadeAccent(accent, 0.15)} 50%, ${accent} 100%)` }}
        aria-hidden
      />

      <header
        className="border-b border-amber-950/5 bg-white/90 backdrop-blur-md"
        style={{ borderBottomColor: `${accent}20` }}
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-6 sm:px-8">
          <div className="flex items-center gap-4">
            {profile.logo_url ? (
              <div className="relative h-16 w-16 overflow-hidden rounded-2xl border-2 shadow-md" style={{ borderColor: `${accent}55` }}>
                <Image
                  src={profile.logo_url}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="64px"
                  unoptimized
                />
              </div>
            ) : (
              <div
                className="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold text-white shadow-lg"
                style={{ backgroundColor: accent, boxShadow: `0 12px 28px ${accent}44` }}
              >
                {profile.business_name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: accentDark }}>
                Artisan près de chez vous
              </p>
              <h1 className="text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">{profile.business_name}</h1>
              {profile.name && <p className="text-sm text-neutral-600">{profile.name}</p>}
            </div>
          </div>
          <div
            className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white shadow-md"
            style={{ backgroundColor: accent }}
          >
            <CalendarHeart className="h-4 w-4 shrink-0" />
            RDV en ligne
          </div>
        </div>
      </header>

      <section
        className="relative overflow-hidden px-5 pb-12 pt-10 sm:px-8 sm:pb-16 sm:pt-14"
        style={{ background: heroGradientTop(accent) }}
      >
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-30 blur-3xl" style={{ backgroundColor: accent }} />
        <div className="relative mx-auto max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-1.5 text-sm font-medium shadow-sm ring-1 ring-black/5">
            <Sparkles className="h-4 w-4" style={{ color: accent }} />
            {firstName ? (
              <span>
                Bonjour, je suis <span className="font-semibold">{firstName}</span>
              </span>
            ) : (
              <span>Bienvenue sur ma page</span>
            )}
          </div>
          <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight text-neutral-900 sm:text-4xl md:text-5xl">
            Ravi·e de vous accueillir ici
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-neutral-700">
            {profile.description ??
              "Écrivez-moi pour votre projet, posez vos questions, puis réservez un créneau quand vous le souhaitez — tout se passe ici, simplement."}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-neutral-600">
            <span className="inline-flex items-center gap-2">
              <Handshake className="h-5 w-5" style={{ color: accent }} />
              Réponse personnalisée
            </span>
            <span className="inline-flex items-center gap-2">
              <Heart className="h-5 w-5 text-rose-500" />
              Écoute & conseil
            </span>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-5xl space-y-16 px-5 pb-20 sm:px-8">
        <VitrineMessages
          artisanId={profile.id}
          slug={profile.slug}
          accent={accent}
          demoMode={demoMode}
          isOwner={isOwner}
          viewerUserId={viewerUserId}
        />

        <section className="space-y-4">
          {isOwner && !demoMode ? (
            <>
              <div className="text-center">
                <h3 className="text-2xl font-bold text-neutral-900">Vos rendez-vous</h3>
                <p className="mt-2 text-neutral-600">
                  Vue calendrier de vos créneaux réservés sur la vitrine — les points rouges indiquent les jours concernés.
                </p>
              </div>
              <div
                className="rounded-3xl border border-white/80 bg-white p-1 shadow-xl ring-1 ring-black/5"
                style={{ boxShadow: `0 24px 60px -12px ${accent}28` }}
              >
                <VitrineOwnerCalendar
                  appointments={ownerAppointments}
                  services={services}
                  accentColor={accent}
                />
              </div>
            </>
          ) : (
            <>
              <div className="text-center">
                <h3 className="text-2xl font-bold text-neutral-900">Réserver un créneau</h3>
                <p className="mt-2 text-neutral-600">
                  Choisissez une prestation, puis une date : les durées et tarifs sont ceux affichés sur chaque formule.
                </p>
              </div>
              <div
                className="rounded-3xl border border-white/80 bg-white p-1 shadow-xl ring-1 ring-black/5"
                style={{ boxShadow: `0 24px 60px -12px ${accent}28` }}
              >
                <BookAppointmentForm
                  artisanId={profile.id}
                  slug={profile.slug}
                  services={services}
                  demoMode={demoMode}
                  accentColor={accent}
                  viewerUserId={viewerUserId}
                />
              </div>
            </>
          )}
        </section>

        <footer className="border-t border-neutral-200 pt-10 text-center text-sm text-neutral-500">
          <p>
            Page proposée avec{" "}
            <Link href="/" className="font-medium underline-offset-4 hover:underline" style={{ color: accentDark }}>
              Soline
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
