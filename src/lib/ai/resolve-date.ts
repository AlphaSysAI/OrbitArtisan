/** Résolution de dates FR / relatives pour l’assistant. */

const MONTHS: Record<string, number> = {
  janvier: 0,
  janv: 0,
  fevrier: 1,
  fevr: 1,
  "février": 1,
  mars: 2,
  avril: 3,
  avr: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  juil: 6,
  aout: 7,
  "août": 7,
  septembre: 8,
  sept: 8,
  octobre: 9,
  oct: 9,
  novembre: 10,
  nov: 10,
  decembre: 11,
  "décembre": 11,
  dec: 11,
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

/**
 * Extrait une date ISO (YYYY-MM-DD) depuis une requête FR.
 * Ex. "demain", "aujourd'hui", "12 aout", "2026-08-12"
 */
export function resolveFrenchDateQuery(raw: string | null | undefined, now = new Date()): string | null {
  if (!raw?.trim()) return null;
  const q = normalizeDateText(raw);

  if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return q;

  if (/\baujourd.?hui\b|\bauj\b/.test(q)) {
    return toIsoDate(now);
  }
  if (/\bdemain\b/.test(q)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return toIsoDate(d);
  }
  if (/\bapres.?demain\b/.test(q)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    return toIsoDate(d);
  }

  const dayMonth = q.match(
    /\b(\d{1,2})\s*(janvier|janv|fevrier|fevr|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)\b/,
  );
  if (dayMonth) {
    const day = Number(dayMonth[1]);
    const month = MONTHS[dayMonth[2]];
    if (month == null || day < 1 || day > 31) return null;
    let year = now.getFullYear();
    const candidate = new Date(year, month, day);
    // Si la date est déjà passée de > 30 jours, on bascule sur l’année suivante.
    const diffDays = (candidate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < -30) year += 1;
    return `${year}-${pad(month + 1)}-${pad(day)}`;
  }

  return null;
}

export function formatIsoDateFr(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
