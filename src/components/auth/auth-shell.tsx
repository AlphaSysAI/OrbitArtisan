import Link from "next/link";
import { ArrowLeft, CalendarCheck, FileText, Globe, PhoneCall, Sparkles } from "lucide-react";

import { getMarketingHomeHref } from "@/lib/site-url";
import { SolineLogoMark } from "@/components/brand/soline-logo-mark";

type AuthShellVariant = "artisan-login" | "artisan-register" | "client";

type AuthShellProps = {
  variant: AuthShellVariant;
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
};

/** Logo carré Soline : même marque que l'en-tête de l'app et les icônes. */
export function SolineMark({ className }: { className?: string }) {
  return <SolineLogoMark className={className} />;
}

const ASIDE_COPY: Record<AuthShellVariant, { title: string; lead: string }> = {
  "artisan-login": {
    title: "Pendant que vous êtes sur le chantier, Soline tient le bureau.",
    lead: "Retrouvez vos appels traités, vos devis et votre planning là où vous les avez laissés.",
  },
  "artisan-register": {
    title: "Votre secrétaire ne prend jamais de pause.",
    lead: "Soline décroche, qualifie la demande et cale le rendez-vous. Vous, vous gardez les mains sur l'outil.",
  },
  client: {
    title: "Vos travaux, suivis simplement.",
    lead: "Devis, factures, rendez-vous et échanges avec votre artisan, réunis au même endroit.",
  },
};

const ARTISAN_FEATURES = [
  { icon: PhoneCall, label: "Secrétaire vocale qui répond à vos clients" },
  { icon: FileText, label: "Devis et factures conformes en quelques minutes" },
  { icon: CalendarCheck, label: "Planning et rendez-vous au même endroit" },
  { icon: Globe, label: "Site vitrine avec prise de rendez-vous" },
] as const;

const CLIENT_FEATURES = [
  { icon: FileText, label: "Consultez et acceptez vos devis en ligne" },
  { icon: CalendarCheck, label: "Suivez vos rendez-vous" },
  { icon: PhoneCall, label: "Échangez directement avec votre artisan" },
] as const;

function AsidePanel({ variant }: { variant: AuthShellVariant }) {
  const copy = ASIDE_COPY[variant];
  const features = variant === "client" ? CLIENT_FEATURES : ARTISAN_FEATURES;

  return (
    <aside className="relative hidden overflow-hidden bg-[#1d2b3b] text-[#f4f1ea] lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col">
      {/* Trame « plan d'architecte » + halo cuivre */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -top-40 -left-32 size-[520px] rounded-full bg-[#c96b2e]/25 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-40 bottom-0 size-[420px] rounded-full bg-[#4a6a8c]/30 blur-3xl"
        aria-hidden
      />

      <div className="relative flex flex-1 flex-col justify-between gap-12 p-10 xl:p-14">
        <Link href={getMarketingHomeHref()} className="flex w-fit items-center gap-3">
          <SolineMark />
          <span className="leading-tight">
            <span className="font-display block text-lg font-semibold tracking-tight">Soline</span>
            <span className="block text-xs text-[#f4f1ea]/60">
              {variant === "client" ? "Espace client" : "Secrétariat & gestion pour artisans du BTP"}
            </span>
          </span>
        </Link>

        <div className="max-w-lg space-y-8">
          <div className="space-y-4">
            <h2 className="font-display text-balance text-4xl leading-[1.08] font-semibold tracking-tight xl:text-5xl">
              {copy.title}
            </h2>
            <p className="text-pretty text-base text-[#f4f1ea]/70">{copy.lead}</p>
          </div>

          <ul className="space-y-3">
            {features.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm text-[#f4f1ea]/90">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] ring-1 ring-white/10">
                  <Icon className="size-4 text-[#e39a63]" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        {variant === "client" ? (
          <div />
        ) : (
          /* Aperçu produit : un appel manqué transformé en rendez-vous */
          <figure className="relative max-w-sm rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#c96b2e] text-white">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-medium tracking-wide text-[#e39a63] uppercase">Soline · il y a 3 min</p>
                <p className="text-sm font-medium">Appel de Mme Laurent, fuite sous l&apos;évier</p>
                <p className="text-sm text-[#f4f1ea]/65">Rendez-vous proposé jeudi à 9 h, SMS de confirmation envoyé.</p>
              </div>
            </div>
          </figure>
        )}
      </div>
      <div className="relative h-1.5 bg-[#c96b2e]" aria-hidden />
    </aside>
  );
}

/** Mise en page commune connexion / inscription : panneau de marque à gauche, formulaire à droite. */
export function AuthShell({ variant, eyebrow, title, description, children }: AuthShellProps) {
  return (
    <div className="min-h-svh bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <AsidePanel variant={variant} />

      <main className="app-grain relative flex min-h-svh flex-col">
        <div className="flex items-center justify-between px-4 pt-5 sm:px-8 lg:px-12 lg:pt-8">
          <Link href={getMarketingHomeHref()} className="flex items-center gap-2.5 lg:invisible">
            <SolineMark className="size-9" />
            <span className="font-display text-base font-semibold tracking-tight">Soline</span>
          </Link>
          <Link
            href={getMarketingHomeHref()}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Retour au site</span>
            <span className="sm:hidden">Site</span>
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-md space-y-7">
            <header className="space-y-2.5">
              <p className="text-xs font-semibold tracking-[0.14em] text-brand uppercase">{eyebrow}</p>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
              {description ? <div className="text-pretty text-sm text-muted-foreground sm:text-base">{description}</div> : null}
            </header>
            {children}
          </div>
        </div>

        <p className="px-4 pb-6 text-center text-xs text-muted-foreground sm:px-8">
          © {new Date().getFullYear()} Soline · Connexion chiffrée et sécurisée
        </p>
      </main>
    </div>
  );
}
