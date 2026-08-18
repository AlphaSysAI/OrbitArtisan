/** Calcule le déboursé sec unitaire (fourniture + main-d'œuvre au coût). */
export function computeDebourseSec(materialCost: number, laborCost: number): number {
  const material = Number.isFinite(materialCost) ? materialCost : 0;
  const labor = Number.isFinite(laborCost) ? laborCost : 0;
  return Math.round((material + labor) * 100) / 100;
}

/** Calcule le coût MO à partir des heures et du taux horaire. */
export function computeLaborCostFromHours(estimatedHours: number, hourlyRateHt: number): number {
  if (!Number.isFinite(estimatedHours) || !Number.isFinite(hourlyRateHt)) return 0;
  return Math.round(estimatedHours * hourlyRateHt * 100) / 100;
}

/**
 * Prix de vente HT à partir du déboursé et d'une marge cible (% du PV).
 * Ex. marge 30 % → PV = déboursé / (1 - 0,30)
 */
export function computeSellingPriceFromMargin(debourseSec: number, targetMarginPercent: number): number {
  if (!Number.isFinite(debourseSec) || debourseSec <= 0) return 0;
  const margin = Math.min(Math.max(targetMarginPercent, 0), 95);
  const price = debourseSec / (1 - margin / 100);
  return Math.round(price * 100) / 100;
}

/** Marge implicite (% du PV) à partir du déboursé et du prix de vente. */
export function computeMarginPercent(debourseSec: number, sellingPriceHt: number): number | null {
  if (!Number.isFinite(sellingPriceHt) || sellingPriceHt <= 0) return null;
  if (!Number.isFinite(debourseSec)) return null;
  const margin = ((sellingPriceHt - debourseSec) / sellingPriceHt) * 100;
  return Math.round(margin * 10) / 10;
}

export function formatEur(value: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}
