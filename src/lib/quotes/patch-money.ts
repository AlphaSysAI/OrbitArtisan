/** Un montant TTC ne peut être transformé sans le taux applicable à la ligne. */
export const QUOTE_PATCH_MONEY_RULE =
  "Montants supposés HT. Si TTC est explicite, ne crée aucune opération de prix pour cette consigne et recopie-la dans unresolved.";

export function requiresQuotePatchVatReview(instruction: string) {
  return /\b(?:T\s*\.?\s*T\s*\.?\s*C|toutes taxes comprises)\b/i.test(instruction);
}
