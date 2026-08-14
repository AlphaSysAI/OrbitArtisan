/** Extraction de plusieurs dates FR dans une phrase. */

import { formatIsoDateFr, toIsoDate } from "@/lib/ai/resolve-date";

const MONTHS: Record<string, number> = {
  janvier: 0,
  janv: 0,
  fevrier: 1,
  fevr: 1,
  mars: 2,
  avril: 3,
  avr: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  juil: 6,
  aout: 7,
  septembre: 8,
  sept: 8,
  octobre: 9,
  oct: 9,
  novembre: 10,
  nov: 10,
  decembre: 11,
  dec: 11,
};

const MONTH_ALT = Object.keys(MONTHS).join("|");

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function normalizeDateText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isoFromParts(year: number, month: number, day: number): string | null {
  if (day < 1 || day > 31 || month < 0 || month > 11) return null;
  const d = new Date(year, month, day);
  if (d.getMonth() !== month || d.getDate() !== day) return null;
  return `${d.getFullYear()}-${pad(month + 1)}-${pad(day)}`;
}

function resolveYear(now: Date, month: number, day: number): number {
  let year = now.getFullYear();
  const candidate = new Date(year, month, day);
  const diffDays = (candidate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < -30) year += 1;
  return year;
}

/**
 * Toutes les dates détectées dans le texte (ordre d’apparition, sans doublon).
 * Gère : demain, 12 août, 27 et 28 août, du 27 au 28 août.
 */
export function extractFrenchDates(raw: string, now = new Date()): string[] {
  if (!raw?.trim()) return [];
  const q = normalizeDateText(raw);
  const found: string[] = [];
  const push = (iso: string | null) => {
    if (iso && !found.includes(iso)) found.push(iso);
  };

  if (/\baujourd.?hui\b|\bauj\b/.test(q)) push(toIsoDate(now));
  if (/\bdemain\b/.test(q)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    push(toIsoDate(d));
  }
  if (/\bapres.?demain\b/.test(q)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    push(toIsoDate(d));
  }

  // « 27 et 28 aout » / « 27, 28 et 29 aout » / « du 27 au 28 aout »
  const multiRe = new RegExp(
    String.raw`\b(?:du\s+)?(\d{1,2})(?:\s*(?:et|,|au|\/|-)\s*(\d{1,2}))+\s*(${MONTH_ALT})\b`,
    "g",
  );
  for (const match of q.matchAll(multiRe)) {
    const monthName = match[3];
    const month = MONTHS[monthName];
    if (month == null) continue;
    const chunk = match[0];
    const days = [...chunk.matchAll(/\b(\d{1,2})\b/g)]
      .map((m) => Number(m[1]))
      .filter((d) => d >= 1 && d <= 31);
    // Si « du 27 au 28 », on prend l’intervalle inclusif
    if (/\bau\b/.test(chunk) && days.length >= 2) {
      const start = Math.min(days[0], days[1]);
      const end = Math.max(days[0], days[1]);
      for (let day = start; day <= end; day++) {
        const year = resolveYear(now, month, day);
        push(isoFromParts(year, month, day));
      }
    } else {
      for (const day of days) {
        const year = resolveYear(now, month, day);
        push(isoFromParts(year, month, day));
      }
    }
  }

  // Singletons « 12 aout » (ignore ceux déjà capturés dans un multi)
  const singleRe = new RegExp(String.raw`\b(\d{1,2})\s*(${MONTH_ALT})\b`, "g");
  for (const match of q.matchAll(singleRe)) {
    const day = Number(match[1]);
    const month = MONTHS[match[2]];
    if (month == null) continue;
    const year = resolveYear(now, month, day);
    push(isoFromParts(year, month, day));
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(q)) push(q);
  for (const m of q.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)) push(m[1]);

  return found;
}

export function formatDateListFr(isos: string[]): string {
  if (!isos.length) return "";
  if (isos.length === 1) return formatIsoDateFr(isos[0]);
  if (isos.length === 2) return `${formatIsoDateFr(isos[0])} et ${formatIsoDateFr(isos[1])}`;
  const head = isos.slice(0, -1).map(formatIsoDateFr).join(", ");
  return `${head} et ${formatIsoDateFr(isos[isos.length - 1])}`;
}
