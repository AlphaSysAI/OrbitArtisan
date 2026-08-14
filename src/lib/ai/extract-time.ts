/** Extraction d’une heure FR dans une phrase (« à 11h », « 14h30 », « midi »). */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function clampToTime(hour: number, minute: number): string | null {
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

/**
 * Retourne "HH:MM" ou null. Ne devine jamais une heure à partir d’un nombre nu
 * (« 13 août » ne doit pas devenir 13h).
 */
export function extractFrenchTime(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const q = normalize(raw);

  if (/\bmidi\b/.test(q)) return /\bmidi et demie?\b/.test(q) ? "12:30" : "12:00";
  if (/\bminuit\b/.test(q)) return "00:00";

  // 11h, 11h30, 11 h 30, 11:30, 11 heures 30
  const match = q.match(/\b(\d{1,2})\s*(?:h|:|heures?)\s*(\d{1,2})?\b/);
  if (!match) return null;

  let hour = Number(match[1]);
  let minute = match[2] ? Number(match[2]) : 0;

  if (!match[2]) {
    const after = q.slice((match.index ?? 0) + match[0].length);
    if (/^\s*et demie?\b/.test(after)) minute = 30;
    else if (/^\s*et quart\b/.test(after)) minute = 15;
    else if (/^\s*moins le quart\b/.test(after)) {
      minute = 45;
      hour -= 1;
    }
  }

  // « 3h de l’après-midi » → 15h
  if (hour <= 12 && /\b(apres midi|apres-midi|du soir|le soir)\b/.test(q)) {
    if (hour !== 12) hour += 12;
  }

  return clampToTime(hour, minute);
}
