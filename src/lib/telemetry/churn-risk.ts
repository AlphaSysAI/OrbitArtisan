import { parisDayKey } from "@/lib/format/date";

/**
 * Score de risque d'abandon — règles simples, explicables, testées.
 * Pas de ML : sur ce segment, 5 signaux métier suffisent et chaque relance
 * doit pouvoir dire à l'artisan POURQUOI on le relance.
 */

export type RiskInput = {
  now: Date;
  accountCreatedAt: Date;
  /** Jours d'ouverture de l'app (YYYY-MM-DD, fuseau Paris) sur les 30 derniers jours. */
  activeDays: string[];
  callsLast7: number;
  callsPrev21: number;
  pendingIntakesOver48h: number;
  oldestPendingIntakeName: string | null;
  quotesSentLast14: number;
  acceptedNotInvoiced: number;
  voiceNumberAssignedAt: Date | null;
  callsSinceNumberAssigned: number;
  trialDaysRemaining: number | null;
};

type RiskSignalCode = "forwarding_inactive" | "stale_intakes" | "inactive" | "call_drop" | "no_quotes" | "trial_low_usage";

export type RiskSignal = { code: RiskSignalCode; weight: number; detail: Record<string, string | number> };

export type RiskLevel = "ok" | "watch" | "at_risk" | "critical";

export type RiskAssessment = { score: number; level: RiskLevel; signals: RiskSignal[] };

const DAY = 86_400_000;

function parisDay(d: Date): string {
  return parisDayKey(d);
}

/** Jours ouvrés (lun-ven) écoulés depuis la dernière présence, jour courant exclu. */
export function businessDaysSinceLastActive(activeDays: string[], now: Date): number {
  const set = new Set(activeDays);
  let count = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - i * DAY);
    if (set.has(parisDay(d))) return count;
    const dow = new Date(`${parisDay(d)}T12:00:00Z`).getUTCDay();
    if (i > 0 && dow !== 0 && dow !== 6) count++;
  }
  return count;
}

export function assessChurnRisk(x: RiskInput): RiskAssessment {
  const signals: RiskSignal[] = [];
  const ageDays = (x.now.getTime() - x.accountCreatedAt.getTime()) / DAY;

  // 1. Renvoi d'appel jamais (ou plus) actif : cause n°1 d'abandon d'une secrétaire IA.
  if (x.voiceNumberAssignedAt) {
    const since = (x.now.getTime() - x.voiceNumberAssignedAt.getTime()) / DAY;
    if (since >= 5 && x.callsSinceNumberAssigned === 0) {
      signals.push({ code: "forwarding_inactive", weight: 45, detail: { days: Math.floor(since) } });
    } else if (x.callsPrev21 >= 6 && x.callsLast7 === 0) {
      signals.push({ code: "forwarding_inactive", weight: 40, detail: { days: 7 } });
    }
  }

  // 2. Devis préparés par Soline qui dorment : valeur produite mais pas captée.
  if (x.pendingIntakesOver48h > 0) {
    signals.push({
      code: "stale_intakes",
      weight: x.pendingIntakesOver48h >= 3 ? 35 : 25,
      detail: { count: x.pendingIntakesOver48h, name: x.oldestPendingIntakeName ?? "" },
    });
  }

  // 3. Absence : 5 jours ouvrés sans ouvrir l'app.
  const idle = businessDaysSinceLastActive(x.activeDays, x.now);
  if (ageDays >= 7 && idle >= 5) signals.push({ code: "inactive", weight: idle >= 10 ? 40 : 30, detail: { days: idle } });

  // 4. Chute du volume d'appels (moins de la moitié de la moyenne hebdo précédente).
  const prevWeekly = x.callsPrev21 / 3;
  if (prevWeekly >= 3 && x.callsLast7 > 0 && x.callsLast7 < prevWeekly / 2) {
    signals.push({ code: "call_drop", weight: 20, detail: { last: x.callsLast7, usual: Math.round(prevWeekly) } });
  }

  // 5. Plus de devis envoyés depuis 14 jours (compte installé).
  if (ageDays >= 14 && x.quotesSentLast14 === 0) signals.push({ code: "no_quotes", weight: 15, detail: {} });

  // 6. Fin d'essai proche sans usage réel.
  if (x.trialDaysRemaining !== null && x.trialDaysRemaining <= 5 && x.quotesSentLast14 + x.callsLast7 < 2) {
    signals.push({ code: "trial_low_usage", weight: 20, detail: { days: x.trialDaysRemaining } });
  }

  // Un devis accepté non facturé est une bonne raison de revenir : on s'en sert pour le message, pas pour le score.
  signals.sort((a, b) => b.weight - a.weight);
  const score = Math.min(100, signals.reduce((s, sig) => s + sig.weight, 0));
  const level: RiskLevel = score >= 70 ? "critical" : score >= 40 ? "at_risk" : score >= 20 ? "watch" : "ok";
  return { score, level, signals };
}

/**
 * Message opérationnel court (≤ 160 caractères avec le lien, sans emoji pour rester en SMS GSM 1 segment).
 * Toujours concret : ce qui attend l'artisan, et le tap qui règle le problème.
 */
export function reengagementMessage(signal: RiskSignal, ctx: { url: string; acceptedNotInvoiced: number }): string {
  const d = signal.detail;
  switch (signal.code) {
    case "forwarding_inactive":
      return `Soline n'a recu aucun appel depuis ${d.days} j : ton renvoi d'appel est sans doute coupe. Reactive-le en 1 tap : ${ctx.url}`;
    case "stale_intakes":
      return `${d.count} devis prepare${Number(d.count) > 1 ? "s" : ""} par Soline attend${Number(d.count) > 1 ? "ent" : ""} ta validation${d.name ? ` (dont ${String(d.name).slice(0, 20)})` : ""}. 1 tap pour envoyer : ${ctx.url}`;
    case "call_drop":
      return `${d.last} appel(s) cette semaine contre ${d.usual} d'habitude. Verifie ton renvoi d'appel : ${ctx.url}`;
    case "trial_low_usage":
      return `Plus que ${d.days} j d'essai. Dicte ton premier devis en 30 s, Soline fait le reste : ${ctx.url}`;
    case "no_quotes":
      return ctx.acceptedNotInvoiced > 0
        ? `${ctx.acceptedNotInvoiced} devis accepte(s) pas encore facture(s). Facture en 1 tap : ${ctx.url}`
        : `Aucun devis envoye depuis 2 semaines. Dicte le prochain en 30 s : ${ctx.url}`;
    case "inactive":
    default:
      return ctx.acceptedNotInvoiced > 0
        ? `${ctx.acceptedNotInvoiced} devis accepte(s) t'attendent pour la facture. 1 tap : ${ctx.url}`
        : `Ca fait ${d.days} jours ouvres sans passage sur Soline. Tes appels et devis en attente : ${ctx.url}`;
  }
}

/** Écran d'arrivée du lien de relance : l'action qui résout le signal, pas l'accueil générique. */
export function reengagementPath(code: RiskSignalCode): string {
  switch (code) {
    case "forwarding_inactive":
    case "call_drop":
      return "/app/reglages?tab=vocal";
    case "stale_intakes":
      return "/app/appels";
    default:
      return "/app";
  }
}
