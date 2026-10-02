/** Alertes de seuil du quota d'appels Soline (sans dépendance server-only). */

type VoiceQuotaThreshold = "80" | "100";

/**
 * Détecte le franchissement d'un seuil (80 % ou 100 % des appels inclus) entre
 * deux décomptes. L'appelant déclenche la notification push correspondante.
 */
export function detectVoiceQuotaThreshold(input: {
  included: number;
  previousUsed: number;
  newUsed: number;
}): VoiceQuotaThreshold | null {
  if (input.included <= 0) return null;

  const previousRatio = input.previousUsed / input.included;
  const newRatio = input.newUsed / input.included;

  if (previousRatio < 1 && newRatio >= 1) return "100";
  if (previousRatio < 0.8 && newRatio >= 0.8) return "80";
  return null;
}
