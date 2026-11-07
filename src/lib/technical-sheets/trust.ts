import type { SheetTrust } from "@/components/technical-sheets/sheet-view";
import type { SheetReview } from "@/lib/technical-sheets/types";

/**
 * Statut affiché à l'artisan d'une fiche de la bibliothèque.
 * null = fiche signalée « à corriger » : retirée de l'app jusqu'à sa correction.
 */
export function libraryTrust(review: SheetReview | undefined): SheetTrust | null {
  if (!review) return { kind: "in_review" };
  if (review.status === "needs_changes") return null;
  return { kind: "verified", reviewerName: review.reviewerName, reviewedAt: review.reviewedAt };
}
