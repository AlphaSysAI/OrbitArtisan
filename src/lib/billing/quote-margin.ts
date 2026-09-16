/**
 * Hypothèse générique, volontairement non personnalisée par artisan (cf. commentaire
 * de `computeQuoteMarginPreview` plus bas) : estimation du déboursé matière (% du PV
 * fournitures facturées).
 */
export const DEFAULT_MATERIAL_COST_RATIO = 0.65;

/**
 * Hypothèse générique de coût de main-d'œuvre (% du PV MO). Pour un solo sans salarié,
 * ce "coût" représente une valorisation forfaitaire de son propre temps (charges,
 * matériel, temps non facturable...), pas un salaire réellement versé — la marge
 * affichée reste donc indicative même dans ce cas.
 */
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

/**
 * Prévisualisation de marge brute à but purement indicatif (bandeau devis) : aucun
 * impact sur les totaux HT/TTC, la facturation, ou l'export comptable.
 *
 * Les ratios par défaut (65 %) sont une hypothèse générique unique, pas calibrée par
 * artisan — `materialCostRatio`/`laborCostRatio` permettent déjà de les personnaliser
 * si un profil (ou un futur réglage) fournit des valeurs plus fines ; en leur absence,
 * l'estimation reste la même pour tous, solo ou avec salariés.
 */
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
