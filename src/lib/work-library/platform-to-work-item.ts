import type { PlatformWorkItem } from "@/lib/work-library/platform-catalog-types";
import type { WorkItemWithCategory } from "@/lib/work-library/types";

/** Projection catalogue → ligne devis / bibliothèque (champs utilisés par l'UI). */
export function platformItemAsWorkItem(
  platformItem: PlatformWorkItem,
  workItemId: string,
  userId = "",
): WorkItemWithCategory {
  const now = new Date().toISOString();
  return {
    id: workItemId,
    user_id: userId,
    category_id: null,
    reference: platformItem.reference,
    title: platformItem.title,
    description: platformItem.description,
    unit: platformItem.unit,
    unit_price_ht: platformItem.unitPriceHt,
    default_vat_rate: platformItem.defaultVatRate,
    labor_cost: platformItem.laborCost,
    material_cost: platformItem.materialCost,
    estimated_hours: platformItem.estimatedHours,
    created_at: now,
    updated_at: now,
    category_name: platformItem.workCategory,
  };
}
