import { ArrowLeft, HardHat } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { loadConnectionDefaultsAction } from "@/app/compte/assistance-actions";
import { ConnectArtisanPanel } from "@/components/client-space/connect-artisan-panel";
import { PrintSheetButton } from "@/components/technical-sheets/sheet-actions";
import { TechnicalSheetView, type SheetTrust } from "@/components/technical-sheets/sheet-view";
import { buttonVariants } from "@/components/ui/button-variants";
import { requireCustomer } from "@/lib/client-space/require-customer";
import { CLIENT_LEVEL_LABEL, CLIENT_SHEET_DISCLAIMER, getClientSheet } from "@/lib/technical-sheets/client/library";
import { loadSheetReviews } from "@/lib/technical-sheets/data";
import { findTrade } from "@/lib/trades/taxonomy";
import { cn } from "@/lib/utils";

/** La mise en relation (server action de cette page) qualifie la demande par l'IA. */
export const maxDuration = 60;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: getClientSheet(id)?.title ?? "Dépannage" };
}

export default async function ClientSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sheet = getClientSheet(id);
  if (!sheet) notFound();

  const auth = await requireCustomer();
  const [reviews, defaults] = await Promise.all([
    auth.ok ? loadSheetReviews(auth.customer.supabase) : Promise.resolve(new Map()),
    loadConnectionDefaultsAction(),
  ]);
  const review = reviews.get(sheet.id);
  if (review?.status === "needs_changes") notFound();
  const trust: SheetTrust =
    review?.status === "verified"
      ? { kind: "verified", reviewerName: review.reviewerName, reviewedAt: review.reviewedAt }
      : { kind: "house" };
  const proLabel = findTrade(sheet.proTrade.categoryId, sheet.proTrade.tradeId)?.label ?? "artisan";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href="/compte/depannage" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft aria-hidden /> Dépannage
        </Link>
        <PrintSheetButton />
      </div>

      <TechnicalSheetView
        sheet={sheet}
        trust={trust}
        disclaimer={CLIENT_SHEET_DISCLAIMER}
        badges={
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-semibold",
              sheet.level === "urgence" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
            )}
          >
            {CLIENT_LEVEL_LABEL[sheet.level]}
          </span>
        }
      >
        <section className="space-y-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <HardHat className="size-5 text-warning" aria-hidden /> Quand appeler un professionnel
          </h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            {sheet.whenToCallPro.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>

        <section id="artisan" className="space-y-3 print:hidden">
          <h2 className="font-display text-lg font-semibold">Besoin d&apos;un {proLabel.toLowerCase()} ?</h2>
          <ConnectArtisanPanel
            defaults={defaults}
            initialTrade={sheet.proTrade}
            initialDescription={`J'ai suivi la fiche « ${sheet.title} » et j'ai besoin d'un professionnel. `}
          />
        </section>
      </TechnicalSheetView>
    </div>
  );
}
