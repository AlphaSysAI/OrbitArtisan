/**
 * Arrondi des quantités de fournitures (devis, métré, ouvrages). Pur, utilisable côté client.
 * - unité discrète (vendue à la pièce ou au conditionnement) : entier supérieur ;
 * - unité continue (m³, m², ml, kg, t, L, h…) : 2 décimales — les chutes et pertes sont déjà
 *   dans les ratios, un arrondi à l'entier les compterait une seconde fois.
 */
const DISCRETE_UNITS =
  /^(u|unites?|pieces?|pces?|sacs?|rouleaux?|boites?|seaux?|pots?|palettes?|bottes?|cartouches?|ens|forfaits?)$/i;

function foldUnit(unit: string): string {
  return unit.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
}

/** Arrondi supérieur au pas 10^-decimals, sans artefact flottant (151,20000000000002 → 151,2). */
export function ceilTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.ceil(Number((value * f).toFixed(6))) / f;
}

export function round2(value: number): number {
  return Math.round(Number((value * 100).toFixed(6))) / 100;
}

export function isDiscreteUnit(unit: string | null | undefined): boolean {
  return DISCRETE_UNITS.test(foldUnit(unit ?? ""));
}

export function roundMaterialQuantity(quantity: number, unit: string | null | undefined): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return isDiscreteUnit(unit) ? Math.ceil(ceilTo(quantity, 2)) : round2(quantity);
}

/**
 * Montant HT d'une ligne en centimes : quantité (ramenée à 2 décimales, comme en base) × PU,
 * arrondi au centime. Même fonction pour l'aperçu, l'enregistrement et la création IA.
 */
export function materialLineTotalCents(quantity: number, unitPriceCents: number): number {
  return Math.round(Number((round2(quantity) * unitPriceCents).toFixed(6)));
}
