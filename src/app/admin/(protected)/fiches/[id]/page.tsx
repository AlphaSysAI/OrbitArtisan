import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TechnicalSheetView } from "@/components/technical-sheets/sheet-view";
import { buttonVariants } from "@/components/ui/button-variants";
import { getAdminDb } from "@/lib/admin/db";
import { getLibrarySheet, sheetTradesLabel } from "@/lib/technical-sheets/catalog";
import { loadSheetReviews } from "@/lib/technical-sheets/data";

/** Aperçu admin d'une fiche, quel que soit son statut de relecture. */
export default async function AdminTechnicalSheetPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sheet = getLibrarySheet(id);
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
        meta={sheetTradesLabel(sheet)}
      />
    </div>
  );
}
