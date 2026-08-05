import type { Metadata } from "next";
import { Hammer, House } from "lucide-react";

import { RoleSelectorCard } from "@/components/role-selector-card";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Bienvenue — Orbit Artisan",
  description: "Choisissez votre profil pour accéder à votre espace Orbit Artisan.",
};

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-background px-6 py-16">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-3xl space-y-10">
        <header className="space-y-3 text-center">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Bienvenue sur Orbit Artisan
          </h1>
          <p className="text-pretty text-base text-muted-foreground">
            Choisissez votre profil pour accéder à votre espace.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <RoleSelectorCard
            href="/login?role=artisan"
            icon={Hammer}
            title="Artisan"
            description="Gérez vos devis, factures, rendez-vous et votre site vitrine."
            cta="Accéder à mon espace pro"
          />
          <RoleSelectorCard
            href="/login?role=particulier"
            icon={House}
            title="Particulier"
            description="Suivez vos devis, vos factures et vos échanges avec votre artisan."
            cta="Accéder à mon espace client"
          />
        </div>
      </div>
    </main>
  );
}
