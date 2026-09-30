/**
 * Garde-fous de coût des numéros Soline (module pur, testable).
 * Numéros achetés à la demande (1 abonnement = 1 numéro) ; chaque numéro Twilio
 * est facturé tous les mois, d'où un plafond coupe-circuit.
 */
export type RefillPolicy = {
  /** Coupe-circuit : plafond de numéros détenus (attribués + quarantaine + libres). */
  maxTotal: number;
};

/** Nombre de numéros qu'un lot admin peut encore acheter sans dépasser le plafond. */
export function clampBulkCount(requested: number, totalActive: number, maxTotal: number, maxPerBatch = 10): number {
  if (!Number.isFinite(requested) || requested < 1) return 0;
  return Math.max(0, Math.min(Math.floor(requested), maxPerBatch, maxTotal - totalActive));
}

function intFromEnv(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function readRefillPolicy(env: Record<string, string | undefined> = process.env): RefillPolicy {
  return { maxTotal: intFromEnv(env.VOICE_POOL_MAX_TOTAL, 30) };
}

/** Alerte plafond : à partir de 80 % des numéros autorisés (VOICE_POOL_MAX_TOTAL). */
export const POOL_CAP_ALERT_RATIO = 0.8;

export function shouldAlertPoolCapacity(totalActive: number, maxTotal: number): boolean {
  if (maxTotal <= 0) return totalActive > 0;
  return totalActive >= Math.ceil(maxTotal * POOL_CAP_ALERT_RATIO);
}
