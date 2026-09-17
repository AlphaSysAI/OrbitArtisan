import type { CustomerClassification } from "./invoicing/classify-customer";

/**
 * Gel de l'émission de factures pendant la phase pilote — scopé au B2B
 * depuis la Vague 7 (17/09/2026, demande dédiée de Florian).
 *
 * Historique (Vague 2) : l'audit pré-pilote avait identifié plusieurs
 * défauts bloquants dans le pipeline de facturation (numérotation non
 * séquentielle, TVA réduite BTP jamais appliquée, doublon de la ligne
 * main-d'œuvre, avoirs émis comme des factures positives). Tous corrigés en
 * Vague 2, dans le moteur de facture commun aux deux flux B2B et B2C — rien
 * dans ces correctifs n'est spécifique à l'un ou l'autre.
 *
 * Vague 7 : la facturation B2C (particuliers, l'immense majorité des
 * clients d'un artisan BTP) ne passe jamais par la Plateforme Agréée — elle
 * alimente seulement `e_reporting_queue` (`classifyCustomer`), une
 * obligation elle-même non applicable aux micro-entreprises avant le 1er
 * septembre 2027 (même calendrier que l'émission B2B). Le seul frein réel
 * restant pour le B2B est l'absence de contrat PA/PDP signé (voir
 * `integrations.md` §2, recommandation Super PDP) — donc gel maintenu côté
 * B2B uniquement, indépendamment de la validation comptable ci-dessous.
 *
 * Validation comptable Vague 2 : Florian a choisi de la considérer comme
 * acquise pour un usage B2C dès maintenant, sous réserve de confirmation par
 * son expert-comptable (rendez-vous prévu semaine du 22/09/2026) —
 * correctifs à apporter après coup si besoin (via avoir, jamais par édition
 * silencieuse d'une facture déjà finalisée/numérotée). Si le retour de
 * l'expert-comptable est négatif : repasser `B2C_INVOICING_FROZEN` à `true`
 * ci-dessous re-gèle tout immédiatement, sans autre changement de code.
 */
export const B2C_INVOICING_FROZEN = false;
export const B2B_INVOICING_FROZEN = true;

/** À utiliser avant toute création de brouillon de facture/avoir. */
export function isDraftInvoicingFrozenForCustomer(customerClass: CustomerClassification): boolean {
  return customerClass === "b2b" ? B2B_INVOICING_FROZEN : B2C_INVOICING_FROZEN;
}

export const INVOICING_FROZEN_ERROR = "invoicing_frozen" as const;

export const INVOICING_FROZEN_B2B_MESSAGE =
  "Facturation désactivée pour ce client professionnel (SIREN + TVA renseignés) — en attente du raccordement à une Plateforme Agréée pour la transmission Factur-X, obligatoire pour les clients B2B. La facturation des particuliers reste disponible.";

export const INVOICING_FROZEN_B2C_MESSAGE =
  "Facturation temporairement désactivée pendant la phase de test — correctifs de conformité en cours de validation avec un expert-comptable.";

/** Message à afficher selon le type de client, si la facturation est gelée pour lui. */
export function frozenInvoicingMessageFor(customerClass: CustomerClassification): string {
  return customerClass === "b2b" ? INVOICING_FROZEN_B2B_MESSAGE : INVOICING_FROZEN_B2C_MESSAGE;
}

/** À utiliser dans les server actions retournant `{ ok, error }`. */
export function frozenInvoicingResult(): { ok: false; error: typeof INVOICING_FROZEN_ERROR } {
  return { ok: false, error: INVOICING_FROZEN_ERROR };
}
