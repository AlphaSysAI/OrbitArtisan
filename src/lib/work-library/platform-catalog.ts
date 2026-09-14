import "server-only";

import { PLATFORM_WORK_CATALOG } from "@/lib/work-library/platform-catalog-data";
import type { PlatformWorkItem } from "@/lib/work-library/platform-catalog-types";
import { findTrade, formatTradeLabel } from "@/lib/trades/taxonomy";

/** Ouvrages visibles pour la catégorie + métier enregistrés sur le profil. */
export function filterPlatformCatalog(
  tradeCategoryId: string | null | undefined,
  tradeId: string | null | undefined,
): PlatformWorkItem[] {
  if (!tradeCategoryId) return [];

  return PLATFORM_WORK_CATALOG.filter((item) => {
    if (item.tradeCategoryId !== tradeCategoryId) return false;
    if (item.tradeIds.length === 0) return true;
    if (!tradeId) return false;
    return item.tradeIds.includes(tradeId);
  });
}

export function searchPlatformCatalog(
  tradeCategoryId: string | null | undefined,
  tradeId: string | null | undefined,
  query: string,
  limit = 24,
): PlatformWorkItem[] {
  const base = filterPlatformCatalog(tradeCategoryId, tradeId);
  const q = query.trim().toLowerCase();
  if (!q) return base.slice(0, limit);

  return base
    .filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.reference.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.workCategory.toLowerCase().includes(q),
    )
    .slice(0, limit);
}

export function getPlatformCatalogItem(id: string): PlatformWorkItem | null {
  return PLATFORM_WORK_CATALOG.find((item) => item.id === id) ?? null;
}

export function platformCatalogMeta(
  tradeCategoryId: string | null | undefined,
  tradeId: string | null | undefined,
): { tradeLabel: string | null; count: number } {
  const tradeLabel = formatTradeLabel(tradeCategoryId, tradeId);
  const count = filterPlatformCatalog(tradeCategoryId, tradeId).length;
  return { tradeLabel, count };
}

export function isTradeConfigured(
  tradeCategoryId: string | null | undefined,
  tradeId: string | null | undefined,
): boolean {
  return findTrade(tradeCategoryId, tradeId) !== null;
}
