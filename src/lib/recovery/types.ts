/** États du pipeline de recouvrement portés par `invoices.recovery_status`. */
export const RECOVERY_STATUSES = [
  "none",
  "formal_notice_sent",
  "submitted_to_collection",
  "in_progress",
  "collected",
  "failed",
] as const;

export type RecoveryStatus = (typeof RECOVERY_STATUSES)[number];

/** États d'acheminement d'une mise en demeure LRAR. */
export const FORMAL_NOTICE_STATUSES = [
  "pending",
  "sent",
  "in_transit",
  "waiting_withdrawal",
  "delivered",
  "returned",
  "wrong_address",
  "failed",
  "canceled",
] as const;

export type FormalNoticeStatus = (typeof FORMAL_NOTICE_STATUSES)[number];

export function isRecoveryStatus(value: unknown): value is RecoveryStatus {
  return typeof value === "string" && (RECOVERY_STATUSES as readonly string[]).includes(value);
}

export function normalizeRecoveryStatus(value: unknown): RecoveryStatus {
  return isRecoveryStatus(value) ? value : "none";
}

export const FORMAL_NOTICE_STATUS_LABELS: Record<FormalNoticeStatus, string> = {
  pending: "Préparation",
  sent: "Déposée à La Poste",
  in_transit: "En cours d'acheminement",
  waiting_withdrawal: "Avis de passage — à retirer au bureau de poste",
  delivered: "Distribuée (accusé de réception)",
  returned: "Retournée à l'expéditeur",
  wrong_address: "Non distribuable (adresse erronée)",
  failed: "Échec d'envoi",
  canceled: "Annulée",
};

export const RECOVERY_STATUS_LABELS: Record<RecoveryStatus, string> = {
  none: "Aucune procédure",
  formal_notice_sent: "Mise en demeure envoyée",
  submitted_to_collection: "Dossier transmis au recouvrement",
  in_progress: "Recouvrement en cours",
  collected: "Créance recouvrée",
  failed: "Recouvrement infructueux",
};

/**
 * Quota mensuel de mises en demeure LRAR incluses dans l'abonnement.
 * Défini ici (et non dans le module serveur) pour rester importable par l'UI.
 */
export type FormalNoticeQuota = {
  /** Lettres incluses dans l'abonnement sur la période. */
  included: number;
  /** Lettres déjà affranchies sur la période. */
  used: number;
  /** Lettres restantes au titre de l'abonnement. */
  remaining: number;
  /** `true` si le prochain envoi sera refacturé à l'artisan. */
  nextIsBillable: boolean;
  /** Début de la période courante (inclus). */
  periodStart: string;
  /** Réinitialisation du quota — les lettres non utilisées sont perdues. */
  periodEnd: string;
};

/** Ligne `formal_notices` exposée à l'UI. */
export type FormalNoticeSummary = {
  id: string;
  status: FormalNoticeStatus;
  trackingNumber: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  hasFilingProof: boolean;
  hasDeliveryProof: boolean;
  failureReason: string | null;
};

/** Ligne `debt_collection_cases` exposée à l'UI. */
export type DebtCollectionSummary = {
  id: string;
  rubypayeurCaseId: string | null;
  status: string;
  amountTotal: number;
  amountCollected: number;
  createdAt: string;
};
