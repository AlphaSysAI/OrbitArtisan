/** Alertes de seuil quota vocal (sans dépendance server-only). */

export function logVoiceQuotaThresholds(input: {
  artisanId: string;
  included: number;
  previousUsed: number;
  newUsed: number;
}): void {
  if (input.included <= 0) return;

  const previousRatio = input.previousUsed / input.included;
  const newRatio = input.newUsed / input.included;

  if (previousRatio < 1 && newRatio >= 1) {
    console.warn(
      `[voice-quota] Quota 100 % atteint — artisan=${input.artisanId} used=${input.newUsed}/${input.included} min`,
    );
    return;
  }

  if (previousRatio < 0.8 && newRatio >= 0.8 && newRatio < 1) {
    console.warn(
      `[voice-quota] Quota 80 % atteint — artisan=${input.artisanId} used=${input.newUsed}/${input.included} min`,
    );
  }
}
