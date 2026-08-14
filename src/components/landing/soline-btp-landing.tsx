"use client";

import { useState } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  FileText,
  Menu,
  Phone,
  PhoneIncoming,
  ShoppingCart,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

const APP_LOGIN = "https://app.solinebtp.fr/login";
const APP_REGISTER = "https://app.solinebtp.fr/register";

const NAV_LINKS = [
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#tarifs", label: "Tarifs" },
  { href: "#temoignages", label: "Témoignages" },
] as const;

const FAQ_ITEMS = [
  {
    question: "Comment fonctionne le renvoi d'appel vers Soline ?",
    answer:
      "Vous activez le renvoi d'appel sur votre ligne pro (ou second numéro) vers Soline en 2 minutes depuis l'app. Quand vous ne répondez pas, Soline décroche, qualifie la demande et vous envoie un récap par SMS avec le créneau proposé au client.",
  },
  {
    question: "Dois-je changer de numéro de téléphone ?",
    answer:
      "Non. Vous gardez votre numéro actuel. Soline fonctionne en complément via renvoi d'appel ou un second numéro affiché sur votre site — vos clients continuent de vous appeler comme avant.",
  },
  {
    question: "Les factures générées sont-elles conformes ?",
    answer:
      "Oui. Soline génère des factures PDF conformes aux obligations françaises, avec mentions légales, TVA et préparation Factur-X pour la facturation électronique B2B à venir.",
  },
] as const;

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-slate-900 sm:text-base">{question}</span>
        <ChevronDown
          className={cn("size-5 shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="border-t border-slate-100 px-5 pb-4 pt-3 text-sm leading-relaxed text-slate-600">
          {answer}
        </div>
      ) : null}
    </div>
  );
}

export function SolineBtpLanding() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
          <a href="#" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-slate-900 text-orange-400">
              <Building2 className="size-5" strokeWidth={2.2} />
            </span>
            <span className="text-lg font-bold tracking-tight text-slate-900">Soline</span>
          </a>

          <nav className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 sm:flex">
            <a href={APP_LOGIN} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Connexion
            </a>
            <a
              href={APP_REGISTER}
              className={cn(
                buttonVariants({ size: "sm" }),
                "border-orange-500 bg-orange-500 text-white hover:bg-orange-600",
              )}
            >
              Essai gratuit 14 jours
            </a>
          </div>

          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-lg border border-slate-200 md:hidden"
            onClick={() => setMobileNavOpen((value) => !value)}
            aria-label={mobileNavOpen ? "Fermer le menu" : "Ouvrir le menu"}
          >
            {mobileNavOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {mobileNavOpen ? (
          <div className="border-t border-slate-100 px-4 py-4 md:hidden">
            <nav className="flex flex-col gap-3">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-slate-700"
                  onClick={() => setMobileNavOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-2 flex flex-col gap-2">
                <a href={APP_LOGIN} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Connexion
                </a>
                <a
                  href={APP_REGISTER}
                  className={cn(
                    buttonVariants({ size: "sm" }),
                    "border-orange-500 bg-orange-500 text-white hover:bg-orange-600",
                  )}
                >
                  Essai gratuit 14 jours
                </a>
              </div>
            </nav>
          </div>
        ) : null}
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(249,115,22,0.08),transparent_55%)]" />
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24">
          <div className="relative space-y-6">
            <Badge
              variant="outline"
              className="h-auto gap-1.5 border-orange-200 bg-orange-50 px-3 py-1 text-orange-700"
            >
              <Zap className="size-3.5" />
              Secrétariat IA &amp; Gestion BTP intégrée
            </Badge>

            <h1 className="font-display text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl lg:text-[3.25rem]">
              Vos devis pliés en 2&nbsp;min, 0 appel manqué sur vos chantiers.
            </h1>

            <p className="max-w-xl text-pretty text-base leading-relaxed text-slate-600 sm:text-lg">
              Soline est l&apos;assistante digitale qui décroche au téléphone quand vous êtes sur une
              échelle, prépare vos paniers de matériaux chez vos fournisseurs et gère votre administratif.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={APP_REGISTER}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-13 w-full border-orange-500 bg-orange-500 px-6 text-base text-white hover:bg-orange-600 sm:w-auto",
                )}
              >
                Démarrer l&apos;essai gratuit de 14 jours
              </a>
            </div>
            <p className="text-sm text-slate-500">Sans carte bancaire • Configuration en 3 minutes</p>
          </div>

          {/* Mockup UI */}
          <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/5 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Devis rapide</p>
                  <p className="text-lg font-semibold text-slate-900">Rénovation SDB — M. Dupont</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Prêt à envoyer
                </span>
              </div>

              <div className="space-y-2 rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Pose carrelage + plomberie</span>
                  <span className="font-semibold text-slate-900">2 840 € HT</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Fournitures incluses</span>
                  <span className="font-semibold text-slate-900">680 € HT</span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex items-center justify-between">
                  <span className="font-medium text-slate-900">Total TTC</span>
                  <span className="text-lg font-bold text-slate-900">4 224 €</span>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <span className="flex-1 rounded-xl bg-slate-900 py-2.5 text-center text-xs font-medium text-white">
                  Envoyer par SMS
                </span>
                <span className="flex-1 rounded-xl border border-slate-200 py-2.5 text-center text-xs font-medium text-slate-700">
                  PDF
                </span>
              </div>
            </div>

            <div className="absolute -bottom-4 -left-2 max-w-[17rem] rounded-2xl border border-emerald-200 bg-white p-3 shadow-lg sm:-left-6">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <PhoneIncoming className="size-4" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-emerald-700">Appel manqué traité par Soline</p>
                  <p className="mt-0.5 text-xs leading-snug text-slate-600">
                    RDV client confirmé — Jeudi 14h, dépannage fuite cuisine.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problème vs Solution */}
      <section className="border-y border-slate-100 bg-slate-50/60 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Fini les soirées perdues sur Excel
            </h2>
            <p className="mt-3 text-slate-600">
              Soline reprend le relais là où vous n&apos;avez plus le temps — au téléphone, en admin, sur les
              achats matériaux.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-red-100 bg-white p-6 sm:p-8">
              <p className="mb-5 text-sm font-semibold uppercase tracking-wider text-red-500">Sans Soline</p>
              <ul className="space-y-4">
                {[
                  "Soirées perdues sur Excel à refaire les devis à la main.",
                  "Chantiers perdus faute de répondre au téléphone sur le toit.",
                  "Trajets inutiles pour vérifier le stock chez le négociant.",
                ].map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-relaxed text-slate-600 sm:text-base">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
                      <X className="size-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm sm:p-8">
              <p className="mb-5 text-sm font-semibold uppercase tracking-wider text-emerald-600">
                Avec Soline
              </p>
              <ul className="space-y-4">
                {[
                  "Administratif automatisé : devis, factures, relances.",
                  "Réponses téléphoniques 24/7 — même quand vous êtes en intervention.",
                  "Devis envoyés par SMS/Mail et suivi de chantier en direct.",
                ].map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-relaxed text-slate-700 sm:text-base">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                      <Check className="size-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Fonctionnalités */}
      <section id="fonctionnalites" className="scroll-mt-24 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Tout ce qu&apos;il faut pour tenir le rythme du chantier
            </h2>
            <p className="mt-3 text-slate-600">
              Un seul outil pour votre secrétariat, vos achats et votre facturation — pensé pour le terrain.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Phone,
                title: "Secrétaire Vocal IA 24/7",
                description:
                  "Décroche automatiquement, note les besoins du client et réserve un créneau dans votre agenda.",
                accent: "bg-slate-900 text-orange-400",
              },
              {
                icon: ShoppingCart,
                title: "Panier Matériaux Automatique",
                description:
                  "Connecté aux enseignes de bricolage et négociants pour remplir le panier client ou artisan.",
                accent: "bg-orange-500 text-white",
              },
              {
                icon: FileText,
                title: "Devis & Factures Ultra-Rapides",
                description: "Génération PDF conforme en 2 clics depuis le mobile, même entre deux chantiers.",
                accent: "bg-slate-100 text-slate-800",
              },
            ].map((feature) => (
              <article
                key={feature.title}
                className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <span
                  className={cn("mb-5 inline-flex size-12 items-center justify-center rounded-2xl", feature.accent)}
                >
                  <feature.icon className="size-6" strokeWidth={2} />
                </span>
                <h3 className="text-lg font-semibold text-slate-900">{feature.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Témoignages */}
      <section id="temoignages" className="scroll-mt-24 border-y border-slate-100 bg-slate-900 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Ils ont repris leurs soirées
            </h2>
            <p className="mt-3 text-slate-300">Des artisans BTP qui ne veulent plus choisir entre le chantier et la paperasse.</p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                quote: "Avant, je ratais 3 appels par semaine. Soline m'en a récupéré 12 le premier mois.",
                name: "Karim L.",
                role: "Plombier — Lyon",
              },
              {
                quote: "Mon devis part en 2 minutes depuis le camion. Plus d'Excel le dimanche soir.",
                name: "Sophie M.",
                role: "Électricienne — Nantes",
              },
              {
                quote: "Le panier matériaux auto m'a fait gagner une demi-journée par gros chantier.",
                name: "Thomas R.",
                role: "Menuisier — Bordeaux",
              },
            ].map((item) => (
              <blockquote
                key={item.name}
                className="rounded-2xl border border-slate-700/80 bg-slate-800/50 p-6"
              >
                <Sparkles className="mb-3 size-5 text-orange-400" />
                <p className="text-sm leading-relaxed text-slate-200">&ldquo;{item.quote}&rdquo;</p>
                <footer className="mt-4 border-t border-slate-700/60 pt-4">
                  <p className="text-sm font-semibold">{item.name}</p>
                  <p className="text-xs text-slate-400">{item.role}</p>
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="tarifs" className="scroll-mt-24 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Tarifs clairs, sans surprise
            </h2>
            <p className="mt-3 text-slate-600">Commencez seul, ajoutez la secrétaire IA quand vous êtes prêt.</p>
          </div>

          <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
            <article className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">Plan Solo</p>
              <p className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-slate-900">39 €</span>
                <span className="text-slate-500">HT / mois</span>
              </p>
              <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-600">
                <li className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  Tout le SaaS BTP
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  Devis illimités
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  1 utilisateur
                </li>
              </ul>
              <a
                href={APP_REGISTER}
                className={cn(buttonVariants({ size: "lg" }), "mt-8 w-full border-slate-900 bg-slate-900 text-white")}
              >
                Démarrer l&apos;essai gratuit
              </a>
            </article>

            <article className="relative flex flex-col rounded-3xl border-2 border-orange-400 bg-white p-6 shadow-lg shadow-orange-500/10 sm:p-8">
              <span className="absolute -top-3 left-6 rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold text-white">
                Option populaire
              </span>
              <p className="text-sm font-semibold uppercase tracking-wider text-orange-600">Plan Secrétariat IA</p>
              <p className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-slate-900">+29 €</span>
                <span className="text-slate-500">HT / mois</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">En complément du Plan Solo</p>
              <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-600">
                <li className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  Agent vocal intelligent
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  60 min d&apos;appels incluses / mois
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  Prise de RDV automatique
                </li>
              </ul>
              <a
                href={APP_REGISTER}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "mt-8 w-full border-orange-500 bg-orange-500 text-white hover:bg-orange-600",
                )}
              >
                Ajouter la secrétaire IA
              </a>
            </article>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-24 border-t border-slate-100 bg-slate-50/60 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="mb-10 text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Questions fréquentes
            </h2>
          </div>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item) => (
              <FaqItem key={item.question} question={item.question} answer={item.answer} />
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA band */}
      <section className="bg-slate-900 py-14 text-white">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">
            Prêt à quitter la paperasse du soir ?
          </h2>
          <p className="mt-3 text-slate-300">14 jours gratuits. Sans carte bancaire. Configuration en 3 minutes.</p>
          <a
            href={APP_REGISTER}
            className={cn(
              buttonVariants({ size: "lg" }),
              "mt-6 border-orange-500 bg-orange-500 text-white hover:bg-orange-600",
            )}
          >
            Essayer Soline gratuitement
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 py-10 text-slate-400">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Building2 className="size-5 text-orange-400" />
            <span className="font-semibold text-white">Soline</span>
          </div>
          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            <a href="#" className="hover:text-white">
              CGU
            </a>
            <a href="#" className="hover:text-white">
              Mentions légales
            </a>
            <a href="#" className="hover:text-white">
              Confidentialité
            </a>
          </nav>
          <p className="text-xs">© {new Date().getFullYear()} Soline. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
