/**
 * Gel temporaire de l'émission de factures pendant la phase pilote.
 *
 * L'audit pré-pilote (docs/audit-pre-pilote.md) a identifié plusieurs défauts
 * bloquants dans le pipeline de facturation (numérotation non séquentielle,
 * TVA réduite BTP jamais appliquée, doublon de la ligne main-d'œuvre, avoirs
 * émis comme des factures positives). Tant que ces correctifs n'ont pas été
 * implémentés ET validés par un expert-comptable (Vague 2), aucune nouvelle
 * facture réelle ne doit être émise.
 *
 * Ce flag couvre toute création d'une nouvelle facture à partir d'un devis :
 * facture standard/solde, acompte, situation, avoir, libération de retenue.
 * Il ne bloque pas l'édition ou la consultation des factures déjà existantes.
 *
 * Pour lever le gel une fois la Vague 2 validée : passer INVOICING_FROZEN à false.
 */
export const INVOICING_FROZEN = true;

export const INVOICING_FROZEN_ERROR = "invoicing_frozen" as const;

export const INVOICING_FROZEN_MESSAGE =
  "Facturation temporairement désactivée pendant la phase de test — correctifs de conformité (TVA, numérotation, avoirs) en cours de validation avec un expert-comptable.";

/** À utiliser dans les server actions retournant `{ ok, error }`. */
export function frozenInvoicingResult(): { ok: false; error: typeof INVOICING_FROZEN_ERROR } {
  return { ok: false, error: INVOICING_FROZEN_ERROR };
}
