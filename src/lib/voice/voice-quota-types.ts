/** Quota vocal du mois civil — importable côté client. */

export type VoiceQuotaSnapshot = {
  artisanId: string;
  voiceMinutesIncluded: number;
  voiceMinutesUsed: number;
  voiceMinutesOverdue: number;
  remainingMinutes: number;
  hasRemainingMinutes: boolean;
  allowOverage: boolean;
  canAcceptCalls: boolean;
  periodStart: string;
  periodEnd: string;
};

export function formatVoiceQuotaMonthLabel(periodStart: string): string {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(
    new Date(periodStart),
  );
}
