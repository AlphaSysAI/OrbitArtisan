/**
 * Marge de l'artisan sur les fournitures (réglages) : appliquée au prix d'ACHAT
 * estimé (web / IA) pour obtenir le prix de vente HT porté sur le devis. Jamais
 * appliquée aux prix déjà « de vente » : bibliothèque de l'artisan, saisie manuelle,
 * fournitures en achat direct par le client (prix fournisseur affiché tel quel).
 */
export const MATERIALS_MARGIN_MAX = 200;

/** « 30 », « 30 % », « 12,5 » → 30 / 12.5 ; vide → 0 ; invalide → null. */
export function parseMaterialsMarginRate(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s|%/g, "").replace(",", ".");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0 || n > MATERIALS_MARGIN_MAX) return null;
  return Math.round(n * 100) / 100;
}

/** Prix d'achat HT (€) → prix de vente HT (€), arrondi au centime. */
export function applyMaterialsMargin(purchasePriceEur: number, marginRate: number | null | undefined): number {
  const rate = marginRate && marginRate > 0 ? Math.min(marginRate, MATERIALS_MARGIN_MAX) : 0;
  return Math.round(Number((purchasePriceEur * (1 + rate / 100) * 100).toFixed(6))) / 100;
}

/** Part du prix de vente correspondant au coût d'achat (indicateur de marge du formulaire). */
export function materialCostRatioFromMargin(marginRate: number | null | undefined): number | undefined {
  if (!marginRate || marginRate <= 0) return undefined;
  return 1 / (1 + marginRate / 100);
}
