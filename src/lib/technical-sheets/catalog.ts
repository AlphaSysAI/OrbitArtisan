import { TECHNICAL_SHEET_LIBRARY } from "@/lib/technical-sheets/library";
import type { LibraryTechnicalSheet } from "@/lib/technical-sheets/types";
import { TRADE_CATEGORIES } from "@/lib/trades/taxonomy";
import { foldSearchText } from "@/lib/work-library/platform-catalog-search";

export function getLibrarySheet(id: string): LibraryTechnicalSheet | null {
  return TECHNICAL_SHEET_LIBRARY.find((sheet) => sheet.id === id) ?? null;
}

/** Fiche utile à ce métier : métier listé, ou fiche de toute la famille. */
export function sheetMatchesTrade(
  sheet: LibraryTechnicalSheet,
  tradeCategoryId: string | null | undefined,
  tradeId: string | null | undefined,
): boolean {
  if (tradeId && sheet.tradeIds.includes(tradeId)) return true;
  return sheet.tradeIds.length === 0 && !!tradeCategoryId && sheet.tradeCategoryId === tradeCategoryId;
}

function sheetSearchText(sheet: LibraryTechnicalSheet): string {
  return foldSearchText(`${sheet.title} ${sheet.summary} ${sheet.keywords.join(" ")}`);
}

/** Tous les mots cherchés doivent apparaître (titre, résumé ou mots-clés). */
export function searchLibrarySheets(query: string, sheets: LibraryTechnicalSheet[] = TECHNICAL_SHEET_LIBRARY) {
  const terms = foldSearchText(query).split(" ").filter((term) => term.length > 1);
  if (terms.length === 0) return sheets;
  return sheets.filter((sheet) => {
    const haystack = sheetSearchText(sheet);
    return terms.every((term) => haystack.includes(term));
  });
}

/** Familles de métiers qui ont au moins une fiche, avec leur nombre de fiches. */
export function libraryFamilies(): { id: string; label: string; count: number }[] {
  return TRADE_CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    count: TECHNICAL_SHEET_LIBRARY.filter((sheet) => sheet.tradeCategoryId === category.id).length,
  })).filter((family) => family.count > 0);
}

/** Libellé du ou des métiers d'une fiche, ex. « Électricien, Électricien industriel ». */
export function sheetTradesLabel(sheet: LibraryTechnicalSheet): string {
  const labels = TRADE_CATEGORIES.flatMap((category) => category.trades)
    .filter((trade) => sheet.tradeIds.includes(trade.id))
    .map((trade) => trade.label);
  if (labels.length > 0) return labels.join(", ");
  return TRADE_CATEGORIES.find((category) => category.id === sheet.tradeCategoryId)?.label ?? "";
}
