/**
 * Point 5 audit pré-pilote : mentions obligatoires liées au paiement.
 * Constantes et texte centralisés ici pour éviter toute divergence avec
 * src/lib/recovery/render-formal-notice-pdf.ts, qui les réutilise.
 */

/** Taux légal des pénalités de retard B2B : taux directeur BCE + 10 points (art. L441-10 C. com.). */
export const DEFAULT_B2B_PENALTY_RATE = 12.15;

/** Indemnité forfaitaire pour frais de recouvrement B2B (art. D441-5 C. com.). */
export const B2B_RECOVERY_INDEMNITY_CENTS = 4000;

/**
 * Mentions de paiement à faire figurer sur toute facture. Le bloc
 * pénalités + indemnité forfaitaire (art. L441-10 / D441-5 C. com.) et la
 * mention d'absence d'escompte (art. L441-9) sont des obligations propres
 * aux relations B2B (Code de commerce) : elles n'ont pas de fondement pour
 * un client consommateur, qui relève du Code de la consommation. Ne
 * JAMAIS les afficher sur une facture B2C.
 */
export function latePaymentMentionLines(params: { isBusinessBuyer: boolean; penaltyRate?: number }): string[] {
  if (!params.isBusinessBuyer) return [];

  const rate = params.penaltyRate ?? DEFAULT_B2B_PENALTY_RATE;
  const rateLabel = rate.toFixed(2).replace(".", ",");
  const indemnityLabel = (B2B_RECOVERY_INDEMNITY_CENTS / 100).toFixed(2).replace(".", ",");

  return [
    "Pas d'escompte pour paiement anticipé.",
    `Retard de paiement : pénalités au taux de ${rateLabel} % l'an (art. L441-10 du Code de commerce) et indemnité forfaitaire pour frais de recouvrement de ${indemnityLabel} € (art. D441-5 du Code de commerce), sans préjudice d'une indemnisation complémentaire sur justificatifs.`,
  ];
}
