import type { Metadata } from "next";
import Link from "next/link";
import { Camera, ShieldCheck, Timer } from "lucide-react";

import { SupabaseMissing } from "@/components/supabase-missing";
import { getMarketingHomeHref } from "@/lib/site-url";

import { EstimationWizard } from "./estimation-wizard";

export const metadata: Metadata = {
  title: "Estimer mes travaux gratuitement | Soline",
  description:
    "Décris ton projet en 2 minutes, obtiens une fourchette de prix indicative et les artisans disponibles près de chez toi. Sans inscription.",
};

type EstimationSearchParams = { artisan?: string | string[] };

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

export default async function EstimationPage({
  searchParams,
}: {
  searchParams: Promise<EstimationSearchParams>;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Estimation indisponible" />;
  }

  const params = await searchParams;
  // Lien ou QR code posé par un artisan : on garde la trace de l'origine du lead.
  const originArtisanSlug = firstParam(params.artisan);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href={getMarketingHomeHref()} className="text-sm font-semibold tracking-tight">
            Soline
          </Link>
          <span className="text-xs text-muted-foreground">Gratuit · sans inscription</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Combien vont coûter tes travaux ?
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Réponds à quelques questions, ajoute une photo, et découvre une fourchette de prix avec les
            artisans disponibles autour de toi.
          </p>
        </div>

        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <Timer className="h-3.5 w-3.5" />2 minutes
          </li>
          <li className="flex items-center gap-1.5">
            <Camera className="h-3.5 w-3.5" />
            Photos ou vidéo
          </li>
          <li className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Coordonnées demandées à la fin
          </li>
        </ul>

        <div className="mt-8">
          <EstimationWizard originArtisanSlug={originArtisanSlug} />
        </div>
      </main>
    </div>
  );
}
