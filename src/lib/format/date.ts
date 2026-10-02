/**
 * Formatage des dates côté app : toujours en français et sur le fuseau
 * Europe/Paris, quel que soit le fuseau du serveur (Vercel = UTC) ou du
 * navigateur. Une date « YYYY-MM-DD » (colonne date) est lue à midi UTC pour
 * ne jamais glisser d'un jour.
 */
export const PARIS_TZ = "Europe/Paris";

export type DateInput = string | number | Date;

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { timeZone: PARIS_TZ, ...opts });
    formatters.set(key, f);
  }
  return f;
}

export function toDate(value: DateInput): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" && DATE_ONLY_RE.test(value)) return new Date(`${value}T12:00:00Z`);
  return new Date(value);
}

/** « 02/10/2026 » par défaut ; `opts` remplace le style (ex. `{ dateStyle: "long" }`). */
export function formatDateFr(value: DateInput, opts: Intl.DateTimeFormatOptions = { dateStyle: "short" }): string {
  return formatter("fr-FR", opts).format(toDate(value));
}

/** « 02/10/2026 09:15 » par défaut. */
export function formatDateTimeFr(
  value: DateInput,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" },
): string {
  return formatter("fr-FR", opts).format(toDate(value));
}

/** « 09:15 ». */
export function formatTimeFr(value: DateInput): string {
  return formatter("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(toDate(value));
}

/** Jour calendaire à Paris au format « YYYY-MM-DD » (clés de jour, comparaisons d'échéance). */
export function parisDayKey(value: DateInput = new Date()): string {
  return formatter("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(toDate(value));
}
