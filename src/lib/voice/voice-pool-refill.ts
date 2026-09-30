/**
 * Calcul du réassort du pool de numéros (module pur, testable).
 * Garde-fous de coût : chaque numéro Twilio est facturé tous les mois.
 */
export type RefillPolicy = {
  /** En dessous de ce nombre de numéros prêts et libres, on réassortit. */
  minAvailable: number;
  /** Niveau visé après réassort. */
  targetAvailable: number;
  /** Plafond absolu de numéros non retirés (libres + attribués). */
  maxTotal: number;
  /** Achats maximum par exécution (≈ 5 s par numéro, cron limité à 120 s). */
  maxPerRun: number;
};

/**
 * Nombre de numéros à acheter : artisans Pro/Premium en attente de numéro
 * + retour au stock visé. La file d'attente passe avant le seuil : un abonné
 * payant sans numéro déclenche un achat même si le stock est « suffisant ».
 */
export function computeRefillCount(params: {
  available: number;
  totalActive: number;
  /** Comptes payants en attente d'attribution. */
  waiting?: number;
  policy: RefillPolicy;
}): number {
  const { available, totalActive, policy } = params;
  const waiting = Math.max(0, params.waiting ?? 0);
  if (waiting === 0 && available >= policy.minAvailable) return 0;
  const wanted = Math.max(0, waiting + policy.targetAvailable - available);
  const room = Math.max(0, policy.maxTotal - totalActive);
  return Math.min(wanted, room, policy.maxPerRun);
}

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
  const minAvailable = intFromEnv(env.VOICE_POOL_MIN_AVAILABLE, 2);
  return {
    minAvailable,
    targetAvailable: Math.max(minAvailable, intFromEnv(env.VOICE_POOL_TARGET_AVAILABLE, 4)),
    maxTotal: intFromEnv(env.VOICE_POOL_MAX_TOTAL, 30),
    maxPerRun: intFromEnv(env.VOICE_POOL_MAX_PER_RUN, 8),
  };
}

/** Alerte plafond : à partir de 80 % des numéros autorisés (VOICE_POOL_MAX_TOTAL). */
export const POOL_CAP_ALERT_RATIO = 0.8;

export function shouldAlertPoolCapacity(totalActive: number, maxTotal: number): boolean {
  if (maxTotal <= 0) return totalActive > 0;
  return totalActive >= Math.ceil(maxTotal * POOL_CAP_ALERT_RATIO);
}
