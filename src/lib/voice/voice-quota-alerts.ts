/** Alertes de seuil quota vocal (sans dépendance server-only). */

export type VoiceQuotaThreshold = "80" | "100";

/**
 * Log (et signale au chargement appelant, cf. voice-quota-service.ts) le
 * franchissement d'un seuil de quota vocal. Retourne le seuil franchi pour que
 * l'appelant puisse en plus déclencher une alerte push à l'artisan sur le seuil
 * 100 % (point "alerte quota vocal" audit pré-pilote, vague 4) — cette fonction
 * elle-même reste sans dépendance server-only, donc pas d'appel push ici.
 */
export function logVoiceQuotaThresholds(input: {
  artisanId: string;
  included: number;
  previousUsed: number;
  newUsed: number;
}): VoiceQuotaThreshold | null {
  if (input.included <= 0) return null;

  const previousRatio = input.previousUsed / input.included;
  const newRatio = input.newUsed / input.included;

  if (previousRatio < 1 && newRatio >= 1) {
    console.warn(
      `[voice-quota] Quota 100 % atteint — artisan=${input.artisanId} used=${input.newUsed}/${input.included} min`,
    );
    return "100";
  }

  if (previousRatio < 0.8 && newRatio >= 0.8 && newRatio < 1) {
    console.warn(
      `[voice-quota] Quota 80 % atteint — artisan=${input.artisanId} used=${input.newUsed}/${input.included} min`,
    );
    return "80";
  }

  return null;
}
