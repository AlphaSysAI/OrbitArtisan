import { formatDateFr } from "@/lib/format/date";

/** Quota vocal Soline du mois civil, compté en appels — importable côté client. */

/**
 * - `full` : Soline qualifie, propose un devis et prend des RDV.
 * - `message_only` : forfait (et plafond de dépassement) atteint, ou formule sans voix :
 *   Soline décroche quand même mais prend uniquement un message. La ligne n'est jamais coupée.
 */
export type SolineVoiceMode = "full" | "message_only";

export type VoiceQuotaSnapshot = {
  artisanId: string;
  /** Essai gratuit : forfait réduit, aucun dépassement facturable. */
  isTrial: boolean;
  callsIncluded: number;
  callsUsed: number;
  remainingCalls: number;
  /** Appels au-delà du forfait ce mois-ci. */
  overageCalls: number;
  /** Prix HT d'un appel hors forfait (centimes). */
  overageCallCents: number;
  /** Plafond mensuel de dépassement choisi par l'artisan (centimes HT). */
  overageCapCents: number;
  /** Montant de dépassement facturable ce mois-ci, plafonné (centimes HT). */
  overageAmountCents: number;
  mode: SolineVoiceMode;
  /** Toujours vrai : Soline ne coupe jamais la ligne (au pire, message seul). */
  canAcceptCalls: true;
  periodStart: string;
  periodEnd: string;
};

export function formatVoiceQuotaMonthLabel(periodStart: string): string {
  return formatDateFr(periodStart, { month: "long", year: "numeric" });
}
