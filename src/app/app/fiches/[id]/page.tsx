import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintSheetButton } from "@/components/technical-sheets/sheet-actions";
import { TechnicalSheetView } from "@/components/technical-sheets/sheet-view";
import { buttonVariants } from "@/components/ui/button-variants";
import { requireArtisanProfileIdOrRedirect } from "@/lib/auth/require-artisan";
import { getLibrarySheet, sheetTradesLabel } from "@/lib/technical-sheets/catalog";
import { loadSheetReviews } from "@/lib/technical-sheets/data";
import { libraryTrust } from "@/lib/technical-sheets/trust";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: getLibrarySheet(id)?.title ?? "Fiche technique" };
}

export default async function TechnicalSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sheet = getLibrarySheet(id);
  if (!sheet) notFound();

  const { supabase } = await requireArtisanProfileIdOrRedirect();
  const reviews = await loadSheetReviews(supabase);
  const trust = libraryTrust(reviews.get(sheet.id));
  // Fiche signalée « à corriger » : retirée de l'app.
  if (!trust) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href="/app/fiches" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft aria-hidden /> Fiches techniques
        </Link>
        <PrintSheetButton />
      </div>
      <TechnicalSheetView sheet={sheet} trust={trust} meta={sheetTradesLabel(sheet)} />
    </div>
  );
}
