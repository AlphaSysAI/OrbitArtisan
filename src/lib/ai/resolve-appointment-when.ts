/**
 * Résolution du jour d'un RDV à créer.
 *
 * Le LLM ne fait jamais foi seul sur la date : il lui arrive de recopier
 * l'exemple du prompt, ce qui plaçait des RDV à des dates sorties de nulle part.
 * On n'accepte sa normalisation que si le message contient bien un indice de
 * date, et à défaut on reprend la date dont on parlait juste avant.
 */

import { extractFrenchDates } from "@/lib/ai/extract-dates";
import { toIsoDate } from "@/lib/ai/resolve-date";

const WEEKDAYS: Record<string, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
};

const MONTH_WORDS =
  "janvier|janv|fevrier|fevr|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Le message parle-t-il d'un jour, d'une façon ou d'une autre ? */
export function hasDateHint(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  const q = normalize(raw);
  return (
    new RegExp(String.raw`\b\d{1,2}\s*(?:${MONTH_WORDS})\b`).test(q) ||
    new RegExp(String.raw`\b(?:${MONTH_WORDS})\b`).test(q) ||
    /\b\d{4}-\d{2}-\d{2}\b/.test(q) ||
    /\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b/.test(q) ||
    /\baujourd.?hui\b|\bauj\b|\bdemain\b|\bapres.?demain\b|\bce soir\b|\bce matin\b|\bcet apres.?midi\b/.test(q) ||
    new RegExp(String.raw`\b(?:${Object.keys(WEEKDAYS).join("|")})\b`).test(q) ||
    /\bdans\s+\d{1,2}\s+jours?\b/.test(q) ||
    /\bsemaine\s+prochaine\b|\bweek.?end\b/.test(q)
  );
}

/** Jours de semaine et repères relatifs, que `extractFrenchDates` ne gère pas. */
function resolveRelativeDay(raw: string, now: Date): string | null {
  const q = normalize(raw);

  if (/\bce soir\b|\bce matin\b|\bcet apres.?midi\b/.test(q)) return toIsoDate(now);

  const inDays = q.match(/\bdans\s+(\d{1,2})\s+jours?\b/);
  if (inDays) {
    const d = new Date(now);
    d.setDate(d.getDate() + Number(inDays[1]));
    return toIsoDate(d);
  }

  const weekday = q.match(new RegExp(String.raw`\b(${Object.keys(WEEKDAYS).join("|")})\b`));
  if (weekday) {
    const target = WEEKDAYS[weekday[1]];
    const d = new Date(now);
    // Toujours dans le futur : « jeudi » un jeudi désigne le jeudi suivant.
    let delta = (target - d.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    // « jeudi prochain » = celui de la semaine d'après, pas celui de cette semaine.
    if (/\bprochain\b|\bsemaine prochaine\b/.test(q) && delta < 7) delta += 7;
    d.setDate(d.getDate() + delta);
    return toIsoDate(d);
  }

  return null;
}

export type ResolvedAppointmentDate = {
  dateIso: string | null;
  /** `history` = date reprise du tour de conversation précédent. */
  source: "message" | "history" | null;
};

export function resolveAppointmentDate(params: {
  message: string;
  /** Date telle que le LLM l'a comprise — crue seulement si le message l'atteste. */
  intentDateQuery?: string | null;
  /** Lignes « Artisan: … » / « Assistant: … », de la plus ancienne à la plus récente. */
  historyLines?: string[];
  now?: Date;
}): ResolvedAppointmentDate {
  const now = params.now ?? new Date();
  const { message } = params;

  const fromMessage = extractFrenchDates(message, now)[0];
  if (fromMessage) return { dateIso: fromMessage, source: "message" };

  const grounded = hasDateHint(message);

  if (grounded && params.intentDateQuery) {
    const fromIntent = extractFrenchDates(params.intentDateQuery, now)[0];
    if (fromIntent) return { dateIso: fromIntent, source: "message" };
  }

  if (grounded) {
    const relative =
      resolveRelativeDay(message, now) ??
      (params.intentDateQuery ? resolveRelativeDay(params.intentDateQuery, now) : null);
    if (relative) return { dateIso: relative, source: "message" };
  }

  // Aucun jour dans la demande : on reprend celui dont on vient de parler.
  // On ignore volontairement toute date_query du LLM ici — c’est souvent une
  // hallucination (recopie d’un exemple du prompt).
  const fromHistory = lastDiscussedDate(params.historyLines ?? [], now);
  if (fromHistory) return { dateIso: fromHistory, source: "history" };

  return { dateIso: null, source: null };
}

/**
 * Dernier jour unique évoqué dans l’historique (du plus récent au plus ancien).
 * Dès qu’un tour cite plusieurs jours, on s’arrête : trop ambigu.
 */
function lastDiscussedDate(historyLines: string[], now: Date): string | null {
  for (const line of [...historyLines].reverse()) {
    const dates = extractFrenchDates(line, now);
    if (dates.length === 1) return dates[0];
    if (dates.length > 1) return null;
  }
  return null;
}
