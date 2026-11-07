import { AppPageHeader } from "@/components/app/app-page-header";
import { SheetsBrowser, type SheetListItem } from "@/components/technical-sheets/sheets-browser";
import { requireArtisanProfileIdOrRedirect } from "@/lib/auth/require-artisan";
import { sheetMatchesTrade, sheetTradesLabel } from "@/lib/technical-sheets/catalog";
import { listAccountAiSheets, loadSheetReviews } from "@/lib/technical-sheets/data";
import { TECHNICAL_SHEET_LIBRARY } from "@/lib/technical-sheets/library";
import { sheetTextSegments } from "@/lib/technical-sheets/sheet-search";
import { libraryTrust } from "@/lib/technical-sheets/trust";
import { findTrade } from "@/lib/trades/taxonomy";

/** La génération IA d'une fiche (server action de cette page) peut prendre près d'une minute. */
export const maxDuration = 60;

export const metadata = { title: "Fiches techniques" };

export default async function TechnicalSheetsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const initialQuery = String((await searchParams).q ?? "").slice(0, 120);
  const { supabase, profileId, profile } = await requireArtisanProfileIdOrRedirect(["trade_category", "trade"]);
  const tradeCategoryId = (profile.trade_category as string | null) ?? null;
  const tradeId = (profile.trade as string | null) ?? null;

  const [reviews, aiSheets] = await Promise.all([loadSheetReviews(supabase), listAccountAiSheets(supabase, profileId)]);

  const sheets: SheetListItem[] = TECHNICAL_SHEET_LIBRARY.flatMap((sheet) => {
    const trust = libraryTrust(reviews.get(sheet.id));
    if (!trust) return [];
    return [
      {
        id: sheet.id,
        title: sheet.title,
        summary: sheet.summary,
        tradesLabel: sheetTradesLabel(sheet),
        segments: sheetTextSegments(sheet),
        mine: sheetMatchesTrade(sheet, tradeCategoryId, tradeId),
        trust,
      },
    ];
  });

  return (
    <div className="space-y-8">
      <AppPageHeader
        title="Fiches techniques"
        description="Les étapes, la sécurité et les contrôles pour réaliser chaque ouvrage dans les règles de l'art."
      />

      <SheetsBrowser
        initialQuery={initialQuery}
        sheets={sheets}
        aiSheets={aiSheets}
        tradeLabel={findTrade(tradeCategoryId, tradeId)?.label ?? null}
      />
    </div>
  );
}
