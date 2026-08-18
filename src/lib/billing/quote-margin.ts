/** Estimation du déboursé matière (% du PV fournitures facturées). */
export const DEFAULT_MATERIAL_COST_RATIO = 0.65;

/** Estimation du coût MO interne (% du PV main-d'œuvre). */
export const DEFAULT_LABOR_COST_RATIO = 0.65;

export type QuoteMarginPreview = {
  grandTotalCents: number;
  laborTotalCents: number;
  materialsTotalCents: number;
  estimatedMaterialCostCents: number;
  estimatedLaborCostCents: number;
  totalCostCents: number;
  grossMarginCents: number;
  grossMarginPercent: number;
};

export function computeQuoteMarginPreview(input: {
  grandTotalCents: number;
  laborTotalCents: number;
  materialsTotalCents: number;
  materialCostRatio?: number;
  laborCostRatio?: number;
}): QuoteMarginPreview {
  const materialRatio = input.materialCostRatio ?? DEFAULT_MATERIAL_COST_RATIO;
  const laborRatio = input.laborCostRatio ?? DEFAULT_LABOR_COST_RATIO;

  const estimatedMaterialCostCents = Math.round(input.materialsTotalCents * materialRatio);
  const estimatedLaborCostCents = Math.round(input.laborTotalCents * laborRatio);
  const totalCostCents = estimatedMaterialCostCents + estimatedLaborCostCents;
  const grossMarginCents = input.grandTotalCents - totalCostCents;
  const grossMarginPercent =
    input.grandTotalCents > 0 ? Math.round((grossMarginCents / input.grandTotalCents) * 1000) / 10 : 0;

  return {
    grandTotalCents: input.grandTotalCents,
    laborTotalCents: input.laborTotalCents,
    materialsTotalCents: input.materialsTotalCents,
    estimatedMaterialCostCents,
    estimatedLaborCostCents,
    totalCostCents,
    grossMarginCents,
    grossMarginPercent,
  };
}

export function formatMarginEur(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}
