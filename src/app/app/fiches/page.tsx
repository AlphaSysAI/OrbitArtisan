import Link from "next/link";
import { Sparkles } from "lucide-react";

import { AppPageHeader } from "@/components/app/app-page-header";
import { SheetsBrowser, type SheetListItem } from "@/components/technical-sheets/sheets-browser";
import { requireArtisanProfileIdOrRedirect } from "@/lib/auth/require-artisan";
import { libraryFamilies, sheetMatchesTrade, sheetTradesLabel } from "@/lib/technical-sheets/catalog";
import { listAccountAiSheets, loadSheetReviews } from "@/lib/technical-sheets/data";
import { TECHNICAL_SHEET_LIBRARY } from "@/lib/technical-sheets/library";
import { libraryTrust } from "@/lib/technical-sheets/trust";
import { foldSearchText } from "@/lib/work-library/platform-catalog-search";

/** La génération IA d'une fiche (server action de cette page) peut prendre près d'une minute. */
export const maxDuration = 60;

export const metadata = { title: "Fiches techniques" };

export default async function TechnicalSheetsPage() {
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
        familyId: sheet.tradeCategoryId,
        tradesLabel: sheetTradesLabel(sheet),
        searchText: foldSearchText(`${sheet.title} ${sheet.summary} ${sheet.keywords.join(" ")}`),
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

      <SheetsBrowser sheets={sheets} families={libraryFamilies()} hasTrade={sheets.some((sheet) => sheet.mine)} />

      {aiSheets.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Mes fiches générées</h2>
          <ul className="divide-y rounded-2xl border bg-card shadow-sm">
            {aiSheets.map((sheet) => (
              <li key={sheet.id}>
                <Link href={`/app/fiches/ia/${sheet.id}`} className="flex items-center gap-3 p-4 hover:bg-muted/50">
                  <Sparkles className="size-4 shrink-0 text-warning" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{sheet.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      Non vérifiée · {new Date(sheet.createdAt).toLocaleDateString("fr-FR")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
