import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TechnicalSheetView } from "@/components/technical-sheets/sheet-view";
import { buttonVariants } from "@/components/ui/button-variants";
import { getAdminDb } from "@/lib/admin/db";
import { getLibrarySheet, sheetTradesLabel } from "@/lib/technical-sheets/catalog";
import { getClientSheet } from "@/lib/technical-sheets/client/library";
import { loadSheetReviews } from "@/lib/technical-sheets/data";

/** Aperçu admin d'une fiche, quel que soit son statut de relecture. */
export default async function AdminTechnicalSheetPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proSheet = getLibrarySheet(id);
  const clientSheet = proSheet ? null : getClientSheet(id);
  const sheet = proSheet ?? clientSheet;
  if (!sheet) notFound();

  const db = getAdminDb();
  const review = db ? (await loadSheetReviews(db)).get(sheet.id) : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/fiches" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        <ArrowLeft aria-hidden /> Toutes les fiches
      </Link>
      <TechnicalSheetView
        sheet={sheet}
        trust={
          review?.status === "verified"
            ? { kind: "verified", reviewerName: review.reviewerName, reviewedAt: review.reviewedAt }
            : { kind: "in_review" }
        }
        meta={proSheet ? sheetTradesLabel(proSheet) : "Fiche dépannage particuliers"}
      >
        {clientSheet ? (
          <section className="space-y-2 rounded-2xl border border-warning/40 bg-warning/10 p-4">
            <h2 className="font-display text-lg font-semibold">Quand appeler un professionnel</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {clientSheet.whenToCallPro.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </TechnicalSheetView>
    </div>
  );
}
