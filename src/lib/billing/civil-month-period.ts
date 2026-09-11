/** Période calendaire (mois civil UTC) pour les quotas mensuels non cumulables. */

export type CivilMonthPeriod = { start: Date; end: Date };

export function getCivilMonthPeriod(now: Date = new Date()): CivilMonthPeriod {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}
