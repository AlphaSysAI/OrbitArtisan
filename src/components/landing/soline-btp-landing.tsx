"use client";

import { useId, useState } from "react";
import {
  BellRing,
  Building2,
  CalendarCheck,
  ChevronDown,
  ClipboardList,
  FileText,
  Gavel,
  Hammer,
  Mail,
  Menu,
  MessageSquareText,
  Phone,
  PhoneIncoming,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  UserCheck,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { SubscriptionPricingGrid } from "@/components/billing/subscription-pricing-grid";
import { TRIAL_DURATION_DAYS } from "@/lib/billing/subscription-access";
import {
  FORMAL_NOTICE_OVERAGE_NOTICE,
  FORMAL_NOTICES_INCLUDED_PER_MONTH,
  formatCentsHtEur,
  formatPriceHtEur,
  SOLINE_BILLABLE_CALL_MIN_SECONDS,
  SOLINE_DEFAULT_OVERAGE_CAP_CENTS,
  SOLINE_TRIAL_CALLS_INCLUDED,
  SUBSCRIPTION_PLANS,
} from "@/lib/billing/subscription-plans";
import { cn } from "@/lib/utils";

/** Contact commercial pour les demandes de démonstration (aucun formulaire : simple e-mail). */
const DEMO_EMAIL = "florian@solinebtp.fr";
const DEMO_MAILTO = `mailto:${DEMO_EMAIL}?subject=${encodeURIComponent(
  "Démonstration Soline",
)}&body=${encodeURIComponent(
  "Bonjour,\n\nJe souhaite une démonstration de Soline.\n\nMétier :\nVille :\nTéléphone :\nCréneaux qui m'arrangent :\n",
)}`;

const NAV_LINKS = [
  { href: "#demonstration", label: "Comment ça marche" },
  { href: "#solution", label: "Fonctionnalités" },
  { href: "#tarifs", label: "Tarifs" },
  { href: "#faq", label: "Questions" },
] as const;

const TRIAL_NOTE = `Essai ${TRIAL_DURATION_DAYS} jours : carte bancaire demandée, 0 € pendant l'essai, résiliable avant la fin.`;

const PAID_VOICE_PLANS = SUBSCRIPTION_PLANS.filter((plan) => plan.solineCallsIncluded > 0);
const overageByPlan = PAID_VOICE_PLANS.map(
  (plan) => `${formatCentsHtEur(plan.solineOverageCallCents)} € HT en ${plan.name}`,
).join(", ");
const defaultCapEur = formatCentsHtEur(SOLINE_DEFAULT_OVERAGE_CAP_CENTS);

const FAQ_ITEMS = [
  {
    question: "Dois-je changer de numéro ?",
    answer: [
      "Non. Vos clients continuent d'appeler votre numéro habituel.",
      "Vous activez un renvoi d'appel « si je ne réponds pas » vers le numéro Soline de votre compte. L'application vous donne le code à composer. Vous pouvez couper ce renvoi quand vous voulez depuis votre téléphone.",
    ],
  },
  {
    question: "Quand Soline répond-elle ?",
    answer: [
      "Uniquement quand vous ne décrochez pas : après une douzaine de secondes de sonnerie, l'appel passe à Soline. Si vous répondez, rien ne change.",
      "Elle répond à toute heure tant que le renvoi est actif, au nom de votre entreprise. Un appel dure au plus 8 minutes.",
    ],
  },
  {
    question: "Comment les rendez-vous sont-ils validés ?",
    answer: [
      "Soline propose seulement des créneaux pris dans vos plages de visite, que vous réglez dans l'application. Sans plage de visite, elle note la demande sans proposer de rendez-vous.",
      "Le créneau choisi par le client est réservé 24 heures, en attente. Vous recevez une notification et vous confirmez ou refusez. Le client reçoit un SMS de confirmation seulement quand vous avez validé. Sans réponse de votre part, le créneau se libère.",
    ],
  },
  {
    question: "Que se passe-t-il si je dépasse mon forfait d'appels ?",
    answer: [
      `Un appel compte s'il aboutit et dure au moins ${SOLINE_BILLABLE_CALL_MIN_SECONDS} secondes. Vous êtes prévenu à 80 % et à 100 % de vos appels inclus.`,
      `Au-delà du forfait, chaque appel est facturé (${overageByPlan}) jusqu'à un plafond mensuel : ${defaultCapEur} € par défaut, réglable, 0 € possible.`,
      "Une fois le plafond atteint, Soline continue de décrocher mais prend seulement un message (nom, numéro, motif), sans rendez-vous ni devis, et sans rien facturer de plus jusqu'à la fin du mois.",
      `Pendant l'essai, ${SOLINE_TRIAL_CALLS_INCLUDED} appels sont inclus, sans dépassement facturé.`,
    ],
  },
  {
    question: "Comment commencer ?",
    answer: [
      "Créez votre compte, renseignez votre entreprise, puis choisissez votre formule.",
      `${TRIAL_NOTE} Un seul essai par entreprise (SIREN).`,
      "Avec Pro ou Premium, un numéro Soline est attribué à votre compte : il ne reste qu'à activer le renvoi d'appel. Vous préférez voir avant ? Demandez une démonstration.",
    ],
  },
] as const;

type Step = {
  icon: typeof Phone;
  title: string;
  text: string;
};

const DEMO_STEPS: Step[] = [
  {
    icon: PhoneIncoming,
    title: "Un client appelle",
    text: "Il compose votre numéro habituel. Vous êtes sur le toit, vous ne décrochez pas : l'appel passe à Soline.",
  },
  {
    icon: MessageSquareText,
    title: "Soline prend la demande",
    text: "Elle répond au nom de votre entreprise, note le nom, l'adresse, le besoin et l'urgence, puis propose un créneau de visite.",
  },
  {
    icon: BellRing,
    title: "Vous êtes prévenu",
    text: "Vous recevez une notification avec le résumé de l'appel, les coordonnées et le créneau demandé.",
  },
  {
    icon: CalendarCheck,
    title: "Vous validez le rendez-vous",
    text: "Un geste pour confirmer : le client reçoit son SMS de confirmation. Vous pouvez aussi refuser.",
  },
];

type Validation = "auto" | "validate" | "you";

const VALIDATION_LABEL: Record<Validation, { label: string; className: string }> = {
  auto: { label: "Automatique", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  validate: { label: "Préparé par Soline, validé par vous", className: "border-orange-200 bg-orange-50 text-orange-800" },
  you: { label: "Vous saisissez", className: "border-slate-200 bg-slate-50 text-slate-700" },
};

const JOURNEY: {
  icon: typeof Phone;
  step: string;
  benefit: string;
  how: string;
  modes: Validation[];
}[] = [
  {
    icon: Phone,
    step: "Demande client",
    benefit: "Les appels que vous ne pouvez pas prendre sont traités.",
    how: "Soline décroche quand vous ne répondez pas et vous transmet une demande claire : qui, où, quoi, quelle urgence.",
    modes: ["auto"],
  },
  {
    icon: CalendarCheck,
    step: "Rendez-vous",
    benefit: "Des visites calées sur vos disponibilités, sans aller-retour au téléphone.",
    how: "Créneaux proposés uniquement dans vos plages de visite. Rien n'est confirmé au client sans votre accord.",
    modes: ["validate"],
  },
  {
    icon: FileText,
    step: "Devis",
    benefit: "Un devis prêt à relire au lieu d'une soirée devant l'ordinateur.",
    how: "Après un appel ou une dictée, un brouillon est préparé avec la main-d'œuvre, les fournitures et vos prix. Vous corrigez à la voix ou à la main, puis vous l'envoyez.",
    modes: ["validate"],
  },
  {
    icon: ShoppingCart,
    step: "Matériaux",
    benefit: "La liste des fournitures déjà chiffrée pour vos achats.",
    how: "Quantités calculées selon l'ouvrage, prix de votre bibliothèque ou de référence, produits fournisseurs avec leur lien. Les quantités restent indicatives : vous les vérifiez sur place.",
    modes: ["validate"],
  },
  {
    icon: Hammer,
    step: "Suivi du chantier",
    benefit: "Savoir où en est le chantier et s'il reste rentable.",
    how: "Vous comparez les heures passées au budget du devis. Les bons d'intervention se font signer sur le téléphone du client.",
    modes: ["you"],
  },
  {
    icon: Receipt,
    step: "Facture",
    benefit: "Facturer en partant du devis, sans tout ressaisir.",
    how: "Acompte, situation de travaux, solde ou avoir, avec les mentions obligatoires. Vous vérifiez avant l'envoi.",
    modes: ["validate"],
  },
];

const RECOVERY_STEPS = [
  {
    title: "Relances par e-mail",
    text: "Une fois l'échéance dépassée, votre client est relancé par e-mail à J+7, J+14, J+21 et J+30. Vous pouvez désactiver ces relances dans vos réglages.",
    mode: "auto" as Validation,
  },
  {
    title: "Mise en demeure en recommandé",
    text: "Soline rédige la mise en demeure avec les sommes dues, les pénalités de retard et l'indemnité de 40 € entre professionnels. Rien ne part sans votre clic.",
    mode: "validate" as Validation,
  },
  {
    title: "Dossier de recouvrement",
    text: "Si la facture reste impayée, vous pouvez confier le dossier à notre partenaire de recouvrement, rémunéré uniquement en cas de succès.",
    mode: "validate" as Validation,
  },
];

function ModeBadge({ mode }: { mode: Validation }) {
  const meta = VALIDATION_LABEL[mode];
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium", meta.className)}>
      {meta.label}
    </span>
  );
}

function FaqItem({ question, answer }: { question: string; answer: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
          aria-expanded={open}
          aria-controls={panelId}
        >
          <span className="text-sm font-semibold text-slate-900 sm:text-base">{question}</span>
          <ChevronDown
            aria-hidden
            className={cn("size-5 shrink-0 text-slate-500 transition-transform", open && "rotate-180")}
          />
        </button>
      </h3>
      <div
        id={panelId}
        hidden={!open}
        className="space-y-2 border-t border-slate-100 px-5 pb-4 pt-3 text-sm leading-relaxed text-slate-700"
      >
        {answer.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </div>
  );
}

type SolineBtpLandingProps = {
  appLoginUrl: string;
  /** Création de compte artisan (essai avec carte bancaire, choix de formule après inscription). */
  registerUrl: string;
};

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500";

function TrialCta({ href, size = "lg", className }: { href: string; size?: "sm" | "lg"; className?: string }) {
  return (
    <a
      href={href}
      className={cn(
        buttonVariants({ size }),
        "justify-center bg-orange-700 text-white hover:bg-orange-800",
        size === "lg" && "h-12 px-6 text-base",
        focusRing,
        className,
      )}
    >
      Essayer {TRIAL_DURATION_DAYS} jours
    </a>
  );
}

export function SolineBtpLanding({ appLoginUrl, registerUrl }: SolineBtpLandingProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen overflow-x-clip bg-white text-slate-900 antialiased">
      <a
        href="#contenu"
        className="sr-only z-[60] rounded-lg bg-white px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Aller au contenu
      </a>

      {/* En-tête */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
          <a href="#" className={cn("flex items-center gap-2.5 rounded-lg", focusRing)}>
            <span className="flex size-9 items-center justify-center rounded-xl bg-slate-900 text-orange-400">
              <Building2 className="size-5" strokeWidth={2.2} aria-hidden />
            </span>
            <span className="text-lg font-bold tracking-tight text-slate-900">Soline</span>
          </a>

          <nav aria-label="Navigation principale" className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={cn("rounded text-sm font-medium text-slate-600 transition-colors hover:text-slate-900", focusRing)}
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 sm:flex">
            <a href={appLoginUrl} className={cn(buttonVariants({ variant: "outline", size: "sm" }), focusRing)}>
              Connexion
            </a>
            <TrialCta href={registerUrl} size="sm" />
          </div>

          <button
            type="button"
            className={cn("inline-flex size-10 items-center justify-center rounded-lg border border-slate-200 md:hidden", focusRing)}
            onClick={() => setMobileNavOpen((value) => !value)}
            aria-label={mobileNavOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={mobileNavOpen}
            aria-controls="menu-mobile"
          >
            {mobileNavOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>

        {mobileNavOpen ? (
          <div id="menu-mobile" className="border-t border-slate-100 px-4 py-4 md:hidden">
            <nav aria-label="Navigation mobile" className="flex flex-col gap-3">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="py-1 text-sm font-medium text-slate-700"
                  onClick={() => setMobileNavOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-2 flex flex-col gap-2">
                <TrialCta href={registerUrl} size="sm" className="w-full" />
                <a href={appLoginUrl} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Connexion
                </a>
              </div>
            </nav>
          </div>
        ) : null}
      </header>

      <main id="contenu">
        {/* A. Promesse */}
        <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(249,115,22,0.08),transparent_55%)]" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-12 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-center lg:gap-16">
            <div className="space-y-6">
              <Badge
                variant="outline"
                className="h-auto gap-1.5 border-orange-200 bg-orange-50 px-3 py-1 text-orange-800"
              >
                <Phone className="size-3.5" aria-hidden />
                Secrétariat téléphonique pour artisans du bâtiment
              </Badge>

              <h1 className="font-display text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl">
                Sur le chantier, vous travaillez. Soline répond à vos clients.
              </h1>

              <p className="max-w-xl text-pretty text-base leading-relaxed text-slate-700 sm:text-lg">
                Quand vous ne pouvez pas décrocher, Soline prend l&apos;appel, note la demande et propose
                un créneau de visite. Vous recevez le résumé sur votre téléphone. Ensuite, devis, factures
                et relances se préparent dans la même application.
              </p>

              <ul className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                {[
                  { icon: Phone, text: "Vous gardez votre numéro" },
                  { icon: UserCheck, text: "Vous validez chaque rendez-vous" },
                ].map((item) => (
                  <li
                    key={item.text}
                    className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900"
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden />
                    {item.text}
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <TrialCta href={registerUrl} className="w-full sm:w-auto" />
                <a
                  href="#demonstration"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "h-12 w-full justify-center px-6 text-base sm:w-auto",
                    focusRing,
                  )}
                >
                  Voir comment ça marche
                </a>
              </div>
              <p className="text-sm text-slate-600">{TRIAL_NOTE}</p>
            </div>

            {/* Illustration : notification d'un appel pris par Soline (scénario fictif) */}
            <figure className="relative mx-auto w-full max-w-md lg:max-w-none">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/5 sm:p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700">
                      <PhoneIncoming className="size-5" aria-hidden />
                    </span>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Appel pris par Soline</p>
                      <p className="font-semibold text-slate-900">Mme Martin — fuite sous l&apos;évier</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-800">
                    À valider
                  </span>
                </div>
                <dl className="space-y-2 rounded-2xl bg-slate-50 p-4 text-sm">
                  {[
                    ["Adresse", "Carcassonne, maison individuelle"],
                    ["Besoin", "Fuite sous l'évier de la cuisine, eau coupée"],
                    ["Urgence", "Dans la semaine"],
                    ["Créneau demandé", "Jeudi 14 h"],
                  ].map(([term, value]) => (
                    <div key={term} className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
                      <dt className="text-slate-500">{term}</dt>
                      <dd className="font-medium text-slate-900 sm:text-right">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 grid grid-cols-2 gap-2" aria-hidden>
                  <span className="rounded-xl bg-slate-900 py-2.5 text-center text-xs font-medium text-white">
                    Confirmer le RDV
                  </span>
                  <span className="rounded-xl border border-slate-200 py-2.5 text-center text-xs font-medium text-slate-700">
                    Refuser
                  </span>
                </div>
              </div>
              <figcaption className="mt-3 text-center text-xs text-slate-500">
                Exemple illustratif — client et demande fictifs.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* B. Démonstration */}
        <section
          id="demonstration"
          aria-labelledby="demonstration-titre"
          className="scroll-mt-24 border-y border-slate-100 bg-slate-50/60 py-16 sm:py-20"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <h2 id="demonstration-titre" className="font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Un appel manqué, de la sonnerie au rendez‑vous
              </h2>
              <p className="mt-3 text-slate-700">
                Voici ce qui se passe quand un client vous appelle pendant que vous travaillez.
              </p>
            </div>

            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {DEMO_STEPS.map((step, index) => (
                <li key={step.title} className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-orange-400">
                      <step.icon className="size-5" aria-hidden />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-orange-700">
                      Étape {index + 1}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{step.text}</p>
                </li>
              ))}
            </ol>

            <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
              <figure className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
                <figcaption className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">Extrait d&apos;un appel</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                    Scénario fictif
                  </span>
                </figcaption>
                <div className="space-y-3 text-sm leading-relaxed">
                  {[
                    { who: "Soline", text: "Bonjour, Dupont Plomberie, je vous écoute. Jean est sur un chantier, je prends votre demande." },
                    { who: "Client", text: "J'ai une fuite sous l'évier, j'ai coupé l'eau." },
                    { who: "Soline", text: "D'accord. À quelle adresse se trouve le logement ? … Jean peut passer jeudi à 14 h, cela vous convient ?" },
                    { who: "Client", text: "Oui, parfait." },
                    { who: "Soline", text: "C'est noté. Jean doit confirmer ce créneau : vous recevrez un SMS dès qu'il l'aura validé." },
                  ].map((line, index) => (
                    <p
                      key={index}
                      className={cn(
                        "max-w-[90%] rounded-2xl px-4 py-2.5",
                        line.who === "Soline"
                          ? "bg-slate-900 text-white"
                          : "ml-auto bg-orange-50 text-slate-900",
                      )}
                    >
                      <span className="sr-only">{line.who} : </span>
                      {line.text}
                    </p>
                  ))}
                </div>
              </figure>

              <div className="flex flex-col justify-between gap-6 rounded-3xl border border-orange-200 bg-orange-50/60 p-6 sm:p-8">
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-slate-900">Ce que vous gardez en main</h3>
                  <ul className="space-y-2 text-sm leading-relaxed text-slate-800">
                    <li className="flex gap-2">
                      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
                      Soline ne propose que vos plages de visite. Le client n&apos;est confirmé qu&apos;après votre accord.
                    </li>
                    <li className="flex gap-2">
                      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
                      Elle n&apos;annonce aucun prix au téléphone : le devis part quand vous l&apos;avez relu.
                    </li>
                    <li className="flex gap-2">
                      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
                      Vous retrouvez chaque appel et son résumé dans l&apos;application.
                    </li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <a
                    href={DEMO_MAILTO}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "lg" }),
                      "h-12 w-full justify-center bg-white px-6 text-base",
                      focusRing,
                    )}
                  >
                    <Mail className="mr-2 size-4" aria-hidden />
                    Demander une démonstration
                  </a>
                  <p className="text-center text-xs text-slate-600">Par e-mail : {DEMO_EMAIL}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* C. Solution complète */}
        <section id="solution" aria-labelledby="solution-titre" className="scroll-mt-24 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <h2 id="solution-titre" className="font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                De l&apos;appel du client jusqu&apos;au paiement
              </h2>
              <p className="mt-3 text-slate-700">
                Une seule application suit la demande à chaque étape. Pour chacune, vous savez ce qui se fait
                tout seul et ce que vous validez.
              </p>
            </div>

            <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {JOURNEY.map((item, index) => (
                <li key={item.step} className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="flex size-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
                      <item.icon className="size-5" aria-hidden />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {index + 1}. {item.step}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold leading-snug text-slate-900">{item.benefit}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-700">{item.how}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.modes.map((mode) => (
                      <ModeBadge key={mode} mode={mode} />
                    ))}
                  </div>
                </li>
              ))}
            </ol>

            {/* Recouvrement : bloc dépliable */}
            <details
              id="recouvrement"
              className="group mt-6 scroll-mt-24 rounded-3xl border border-slate-200 bg-slate-50/60 open:bg-white"
            >
              <summary
                className={cn(
                  "flex cursor-pointer list-none items-start gap-4 rounded-3xl p-6 [&::-webkit-details-marker]:hidden",
                  focusRing,
                )}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                  <Gavel className="size-5" aria-hidden />
                </span>
                <span className="flex-1">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                    7. Relances et impayés
                  </span>
                  <span className="mt-1 block text-base font-semibold text-slate-900">
                    Une facture en retard est relancée, puis mise en demeure si besoin.
                  </span>
                  <span className="mt-1 block text-sm text-slate-700">
                    Relances par e-mail automatiques ; recommandé et recouvrement seulement sur votre
                    validation. <span className="font-medium text-orange-700 group-open:hidden">Voir le détail</span>
                  </span>
                </span>
                <ChevronDown
                  className="mt-1 size-5 shrink-0 text-slate-500 transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <div className="border-t border-slate-100 px-6 pb-6 pt-4">
                <ol className="grid gap-4 md:grid-cols-3">
                  {RECOVERY_STEPS.map((item, index) => (
                    <li key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Étape {index + 1}</p>
                      <h3 className="mt-1 font-semibold text-slate-900">{item.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-700">{item.text}</p>
                      <div className="mt-3">
                        <ModeBadge mode={item.mode} />
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="mt-4 text-sm leading-relaxed text-slate-700">
                  Chaque abonnement comprend {FORMAL_NOTICES_INCLUDED_PER_MONTH} mise en demeure en recommandé
                  avec accusé de réception par mois, affranchissement inclus. {FORMAL_NOTICE_OVERAGE_NOTICE}
                </p>
              </div>
            </details>
          </div>
        </section>

        {/* E. Tarifs */}
        <section
          id="tarifs"
          aria-labelledby="tarifs-titre"
          className="scroll-mt-24 border-t border-slate-100 bg-slate-50/60 py-16 sm:py-20"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <h2 id="tarifs-titre" className="font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Tarifs
              </h2>
              <p className="mt-3 text-slate-700">
                Devis, factures, chantiers et relances sont les mêmes dans les trois formules. La différence :
                le secrétariat téléphonique Soline et le nombre d&apos;appels inclus.
              </p>
            </div>

            <div className="mx-auto mb-10 max-w-4xl overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-left text-xs sm:text-sm">
                <caption className="sr-only">Comparaison des formules</caption>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                    <th scope="col" className="px-2.5 py-3 sm:px-4 font-semibold">
                      Formule
                    </th>
                    {SUBSCRIPTION_PLANS.map((plan) => (
                      <th key={plan.id} scope="col" className="px-2.5 py-3 sm:px-4 font-semibold text-slate-900">
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  <tr>
                    <th scope="row" className="px-2.5 py-3 sm:px-4 font-medium text-slate-900">
                      Prix mensuel
                    </th>
                    {SUBSCRIPTION_PLANS.map((plan) => (
                      <td key={plan.id} className="px-2.5 py-3 sm:px-4 tabular-nums">
                        {formatPriceHtEur(plan.priceMonthlyHtEur)} € HT
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row" className="px-2.5 py-3 sm:px-4 font-medium text-slate-900">
                      Secrétariat Soline
                    </th>
                    {SUBSCRIPTION_PLANS.map((plan) => (
                      <td key={plan.id} className="px-2.5 py-3 sm:px-4">
                        {plan.solineCallsIncluded > 0 ? "Oui" : "Non"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row" className="px-2.5 py-3 sm:px-4 font-medium text-slate-900">
                      Appels inclus par mois
                    </th>
                    {SUBSCRIPTION_PLANS.map((plan) => (
                      <td key={plan.id} className="px-2.5 py-3 sm:px-4 tabular-nums">
                        {plan.solineCallsIncluded > 0 ? plan.solineCallsIncluded : "—"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row" className="px-2.5 py-3 sm:px-4 font-medium text-slate-900">
                      Appel au-delà du forfait
                    </th>
                    {SUBSCRIPTION_PLANS.map((plan) => (
                      <td key={plan.id} className="px-2.5 py-3 sm:px-4 tabular-nums">
                        {plan.solineOverageCallCents > 0 ? `${formatCentsHtEur(plan.solineOverageCallCents)} € HT` : "—"}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <SubscriptionPricingGrid variant="landing" ctaHref={registerUrl} />

            <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-orange-200 bg-white p-6 sm:p-8">
              <h3 className="font-display text-xl font-semibold text-slate-900">Comment les appels sont comptés</h3>
              <ul className="mt-4 space-y-2 text-sm leading-relaxed text-slate-700">
                <li>
                  Un appel compte s&apos;il aboutit et dure au moins {SOLINE_BILLABLE_CALL_MIN_SECONDS} secondes.
                  Les raccrochés et les faux numéros ne comptent pas.
                </li>
                <li>
                  Au-delà du forfait, chaque appel est facturé jusqu&apos;à un plafond mensuel que vous réglez
                  ({defaultCapEur} € par défaut, 0 € possible).
                </li>
                <li>
                  Plafond atteint : Soline décroche toujours, mais prend seulement un message, sans frais
                  supplémentaires jusqu&apos;à la fin du mois.
                </li>
                <li>
                  {TRIAL_NOTE} {SOLINE_TRIAL_CALLS_INCLUDED} appels Soline sont inclus pendant l&apos;essai.
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* F. FAQ */}
        <section id="faq" aria-labelledby="faq-titre" className="scroll-mt-24 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 id="faq-titre" className="mb-8 text-center font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Questions fréquentes
            </h2>
            <div className="space-y-3">
              {FAQ_ITEMS.map((item) => (
                <FaqItem key={item.question} question={item.question} answer={item.answer} />
              ))}
            </div>
          </div>
        </section>

        {/* G. Dernier appel à l'action */}
        <section aria-labelledby="cta-titre" className="bg-slate-900 py-14 text-white">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <ClipboardList className="mx-auto mb-4 size-8 text-orange-400" aria-hidden />
            <h2 id="cta-titre" className="font-display text-2xl font-semibold sm:text-3xl">
              Laissez Soline répondre pendant que vous êtes sur le chantier
            </h2>
            <p className="mt-3 text-slate-300">{TRIAL_NOTE}</p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <TrialCta href={registerUrl} className="w-full sm:w-auto" />
              <a
                href={DEMO_MAILTO}
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-12 w-full justify-center border-slate-600 bg-transparent px-6 text-base text-white hover:bg-slate-800 hover:text-white sm:w-auto",
                  focusRing,
                )}
              >
                Demander une démonstration
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 bg-slate-950 py-10 text-slate-400">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Building2 className="size-5 text-orange-400" aria-hidden />
            <span className="font-semibold text-white">Soline</span>
          </div>
          <nav aria-label="Liens légaux" className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            <a href="/cgu" className="hover:text-white">
              CGU
            </a>
            <a href="/cgv" className="hover:text-white">
              CGV
            </a>
            <a href="/mentions-legales" className="hover:text-white">
              Mentions légales
            </a>
            <a href="/confidentialite" className="hover:text-white">
              Confidentialité
            </a>
            <a href={`mailto:${DEMO_EMAIL}`} className="hover:text-white">
              Contact
            </a>
          </nav>
          <p className="text-xs">© {new Date().getFullYear()} Soline. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
