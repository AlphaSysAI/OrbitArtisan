import type { PlatformWorkItem } from "@/lib/work-library/platform-catalog-types";
import type { WORK_UNITS } from "@/lib/work-library/units";

/**
 * Ligne compacte du catalogue Soline :
 * [référence, désignation, descriptif, unité, prix HT, TVA, coût MO, coût fournitures, heures, métiers?]
 *
 * - prix HT = prix de vente indicatif posé (fourniture + pose), marché France 2025-2026 ;
 * - coût MO = heures × taux horaire chargé ; coût fournitures = achat HT ;
 * - métiers : ids `trade` de la taxonomie ; absent = tous les métiers de la famille.
 */
export type CatalogRow = [
  reference: string,
  title: string,
  description: string,
  unit: (typeof WORK_UNITS)[number],
  unitPriceHt: number,
  vat: 0 | 5.5 | 10 | 20,
  laborCost: number,
  materialCost: number,
  estimatedHours: number,
  tradeIds?: string[],
];

/** Groupes { « Famille d'ouvrage » : lignes } → ouvrages du catalogue d'une famille de métiers. */
export function defineCatalog(
  tradeCategoryId: string,
  groups: Record<string, CatalogRow[]>,
): PlatformWorkItem[] {
  return Object.entries(groups).flatMap(([workCategory, rows]) =>
    rows.map(([reference, title, description, unit, unitPriceHt, vat, laborCost, materialCost, estimatedHours, tradeIds]) => ({
      id: reference.toLowerCase(),
      tradeCategoryId,
      tradeIds: tradeIds ?? [],
      workCategory,
      reference,
      title,
      description,
      unit,
      unitPriceHt,
      defaultVatRate: vat,
      laborCost,
      materialCost,
      estimatedHours,
    })),
  );
}
