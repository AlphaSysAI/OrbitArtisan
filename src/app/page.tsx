import Link from "next/link";
import { ArrowRight, CalendarCheck2, FileText, Globe2, Network, ShieldCheck } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-foreground/10 ring-1 ring-border" />
            <div className="leading-tight">
              <p className="text-sm font-semibold">AlphaSys‑Artisan</p>
              <p className="text-xs text-muted-foreground">Gestion + Site vitrine + Réseau</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link href="/site/demo-artisan" className={buttonVariants({ variant: "ghost" })}>
              Démo vitrine
            </Link>
            <Link href="/login" className={buttonVariants({ variant: "secondary" })}>
              Connexion
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -top-40 left-1/2 h-[520px] w-[920px] -translate-x-1/2 rounded-full bg-gradient-to-b from-foreground/10 to-transparent blur-3xl" />
          </div>

          <div className="container mx-auto grid gap-10 px-6 py-16 md:grid-cols-2 md:py-24">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Next.js 14 + Supabase</Badge>
                <Badge variant="outline">Dark/Light</Badge>
                <Badge variant="outline">RDV en ligne</Badge>
              </div>

              <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
                Le SaaS tout‑en‑un pour artisans.
                <span className="text-muted-foreground"> Gestion, vitrine, et prises de RDV.</span>
              </h1>

              <p className="text-pretty text-base leading-7 text-muted-foreground md:text-lg">
                AlphaSys‑Artisan centralise tes devis, factures et planning — et génère automatiquement
                un site vitrine professionnel avec un calendrier de réservation simple.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/login"
                  className={buttonVariants({ size: "lg", className: "gap-2" })}
                >
                  Démarrer <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/site/demo-artisan"
                  className={buttonVariants({ size: "lg", variant: "secondary" })}
                >
                  Voir une vitrine
                </Link>
              </div>

              <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  Auth Supabase
                </div>
                <div className="flex items-center gap-2">
                  <CalendarCheck2 className="h-4 w-4" />
                  RDV en ligne
                </div>
                <div className="flex items-center gap-2">
                  <Globe2 className="h-4 w-4" />
                  URL `/site/[slug]`
                </div>
              </div>
            </div>

            <div className="relative">
              <Card className="overflow-hidden">
                <div className="border-b bg-muted/30 px-6 py-4">
                  <p className="text-sm font-medium">Aperçu</p>
                  <p className="text-xs text-muted-foreground">
                    Planning + services + prise de RDV (version MVP)
                  </p>
                </div>
                <CardContent className="space-y-4 p-6">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border bg-card p-4">
                      <p className="text-sm font-medium">Services</p>
                      <p className="text-xs text-muted-foreground">Durée + prix</p>
                    </div>
                    <div className="rounded-xl border bg-card p-4">
                      <p className="text-sm font-medium">RDV</p>
                      <p className="text-xs text-muted-foreground">Confirmés / en attente</p>
                    </div>
                    <div className="rounded-xl border bg-card p-4">
                      <p className="text-sm font-medium">Devis</p>
                      <p className="text-xs text-muted-foreground">Éditer, envoyer et valider</p>
                    </div>
                    <div className="rounded-xl border bg-card p-4">
                      <p className="text-sm font-medium">Factures</p>
                      <p className="text-xs text-muted-foreground">Créer depuis un devis + paiement</p>
                    </div>
                  </div>
                  <Separator />
                  <p className="text-sm text-muted-foreground">
                    Objectif: réduire l’administratif et augmenter les RDV, sans multiplier les outils.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/20">
          <div className="container mx-auto px-6 py-16">
            <div className="mx-auto max-w-3xl space-y-3 text-center">
              <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                Un trio gagnant: Gestion + Vitrine + Réseau
              </h2>
              <p className="text-muted-foreground">
                Le MVP couvre déjà la gestion complète: devis, factures et échange client/artisan,
                pour réduire l’administratif et augmenter les RDV.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4" /> Gestion
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Centralise l’activité (services, RDV, puis devis et factures) dans un tableau de bord
                  simple.
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Globe2 className="h-4 w-4" /> Site vitrine
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Une page publique par artisan (`/site/[slug]`) avec infos, services et prise de RDV.
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Network className="h-4 w-4" /> Réseau
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Découverte locale et recommandations (prévu). Un cercle vertueux pour remplir le
                  planning.
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <footer className="border-t">
          <div className="container mx-auto flex flex-col gap-3 px-6 py-10 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} AlphaSys‑Artisan
            </p>
            <div className="flex gap-4 text-sm">
              <Link className="text-muted-foreground hover:text-foreground" href="/login">
                Connexion
              </Link>
              <Link className="text-muted-foreground hover:text-foreground" href="/site/demo-artisan">
                Démo vitrine
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
