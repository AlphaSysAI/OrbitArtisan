/**
 * Plages de visite de l'artisan et calcul des créneaux proposés par Soline.
 * Heures saisies en heure locale de Paris ; tous les instants manipulés sont en UTC.
 * Sans dépendance serveur : testable et utilisable côté client.
 */

export const VISIT_TIMEZONE = "Europe/Paris";

export type IsoWeekday = "1" | "2" | "3" | "4" | "5" | "6" | "7";
export const ISO_WEEKDAYS: IsoWeekday[] = ["1", "2", "3", "4", "5", "6", "7"];
export const WEEKDAY_LABELS: Record<IsoWeekday, string> = {
  "1": "Lundi",
  "2": "Mardi",
  "3": "Mercredi",
  "4": "Jeudi",
  "5": "Vendredi",
  "6": "Samedi",
  "7": "Dimanche",
};

export type VisitRange = { start: string; end: string };
export type VisitHours = Record<IsoWeekday, VisitRange[]>;

export const VISIT_DURATION_OPTIONS = [30, 45, 60, 90, 120] as const;

/** Délai minimum entre l'appel et le premier créneau proposé. */
export const VISIT_MIN_LEAD_MINUTES = 120;
/** Horizon de recherche des créneaux. */
export const VISIT_SEARCH_DAYS = 14;
/** Un RDV pris par Soline sans validation expire au bout de 24 h. */
export const VOICE_APPOINTMENT_PENDING_TTL_HOURS = 24;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function emptyVisitHours(): VisitHours {
  return { "1": [], "2": [], "3": [], "4": [], "5": [], "6": [], "7": [] };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Valide et normalise des plages (JSON libre en base ou saisie formulaire).
 * Rejette toute plage invalide, vide ou qui chevauche une autre le même jour.
 */
export function parseVisitHours(raw: unknown): { ok: true; value: VisitHours } | { ok: false; error: string } {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Format de plages invalide." };
  }
  const input = raw as Record<string, unknown>;
  const result = emptyVisitHours();

  for (const day of ISO_WEEKDAYS) {
    const ranges = input[day];
    if (ranges == null) continue;
    if (!Array.isArray(ranges)) return { ok: false, error: `${WEEKDAY_LABELS[day]} : format invalide.` };
    if (ranges.length > 4) return { ok: false, error: `${WEEKDAY_LABELS[day]} : 4 plages maximum.` };

    const parsed: VisitRange[] = [];
    for (const r of ranges) {
      const start = String((r as VisitRange | null)?.start ?? "").trim();
      const end = String((r as VisitRange | null)?.end ?? "").trim();
      if (!HHMM.test(start) || !HHMM.test(end)) {
        return { ok: false, error: `${WEEKDAY_LABELS[day]} : heure invalide (format HH:MM).` };
      }
      if (toMinutes(end) <= toMinutes(start)) {
        return { ok: false, error: `${WEEKDAY_LABELS[day]} : la fin doit être après le début.` };
      }
      parsed.push({ start, end });
    }
    parsed.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    for (let i = 1; i < parsed.length; i++) {
      if (toMinutes(parsed[i].start) < toMinutes(parsed[i - 1].end)) {
        return { ok: false, error: `${WEEKDAY_LABELS[day]} : des plages se chevauchent.` };
      }
    }
    result[day] = parsed;
  }

  return { ok: true, value: result };
}

export function hasAnyVisitRange(hours: VisitHours | null | undefined): boolean {
  return !!hours && ISO_WEEKDAYS.some((d) => hours[d].length > 0);
}

/** Décalage (ms) du fuseau par rapport à UTC à un instant donné. */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Convertit une heure murale (jour + HH:MM à Paris) en instant UTC, DST compris. */
export function zonedWallTimeToUtc(
  ymd: { year: number; month: number; day: number },
  hhmm: string,
  timeZone: string = VISIT_TIMEZONE,
): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const guess = Date.UTC(ymd.year, ymd.month - 1, ymd.day, h, m);
  const first = guess - timeZoneOffsetMs(new Date(guess), timeZone);
  const second = guess - timeZoneOffsetMs(new Date(first), timeZone);
  return new Date(second);
}

/** Jour civil (et jour ISO) à Paris pour un instant donné. */
export function zonedCalendarDay(
  instant: Date,
  timeZone: string = VISIT_TIMEZONE,
): { year: number; month: number; day: number; isoWeekday: IsoWeekday } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    isoWeekday: String(weekdayIndex) as IsoWeekday,
  };
}

export type BusyInterval = { start: Date; end: Date };

/** Plages par défaut quand l'artisan n'a rien réglé : du lundi au vendredi, 9 h – 12 h et 14 h – 18 h. */
export const DEFAULT_VISIT_HOURS: VisitHours = {
  "1": [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "18:00" }],
  "2": [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "18:00" }],
  "3": [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "18:00" }],
  "4": [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "18:00" }],
  "5": [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "18:00" }],
  "6": [],
  "7": [],
};

/** Jour ISO (1 = lundi) d'une date civile. */
export function isoWeekdayOf(ymd: { year: number; month: number; day: number }): IsoWeekday {
  const js = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day)).getUTCDay(); // 0 = dimanche
  return String(js === 0 ? 7 : js) as IsoWeekday;
}

/**
 * Créneaux d'un jour civil (heure de Paris), pas = durée de la prestation, sans jamais
 * déborder d'une plage, au plus tôt `minLeadMinutes` après maintenant, hors RDV existants.
 */
export function slotsForParisDay(input: {
  ymd: { year: number; month: number; day: number };
  hours: VisitHours;
  durationMinutes: number;
  busy?: BusyInterval[];
  now: Date;
  minLeadMinutes?: number;
}): Date[] {
  const durationMs = input.durationMinutes * 60_000;
  if (durationMs <= 0) return [];
  const earliest = input.now.getTime() + (input.minLeadMinutes ?? VISIT_MIN_LEAD_MINUTES) * 60_000;
  const busy = input.busy ?? [];
  const slots: Date[] = [];
  for (const range of input.hours[isoWeekdayOf(input.ymd)] ?? []) {
    const rangeStart = zonedWallTimeToUtc(input.ymd, range.start).getTime();
    const rangeEnd = zonedWallTimeToUtc(input.ymd, range.end).getTime();
    for (let t = rangeStart; t + durationMs <= rangeEnd; t += durationMs) {
      if (t < earliest) continue;
      const end = t + durationMs;
      if (busy.some((b) => t < b.end.getTime() && end > b.start.getTime())) continue;
      slots.push(new Date(t));
    }
  }
  return slots;
}

/** Le jour a-t-il au moins une plage ouverte ? */
export function isOpenDay(hours: VisitHours, ymd: { year: number; month: number; day: number }): boolean {
  return (hours[isoWeekdayOf(ymd)] ?? []).length > 0;
}

/**
 * Créneaux libres dans les plages de visite, en ordre chronologique.
 * - pas de créneau à moins de VISIT_MIN_LEAD_MINUTES de maintenant ;
 * - un créneau ne déborde jamais de sa plage ;
 * - tout RDV non annulé (pending compris) bloque.
 */
export function computeVisitSlots(input: {
  hours: VisitHours;
  durationMinutes: number;
  busy: BusyInterval[];
  now: Date;
  days?: number;
  limit?: number;
  minLeadMinutes?: number;
}): Date[] {
  const days = input.days ?? VISIT_SEARCH_DAYS;
  const limit = input.limit ?? 50;
  const slots: Date[] = [];

  for (let offset = 0; offset <= days && slots.length < limit; offset++) {
    // Jours civils successifs à Paris à partir de maintenant.
    const day = zonedCalendarDay(new Date(input.now.getTime() + offset * 86_400_000));
    for (const slot of slotsForParisDay({
      ymd: day,
      hours: input.hours,
      durationMinutes: input.durationMinutes,
      busy: input.busy,
      now: input.now,
      minLeadMinutes: input.minLeadMinutes,
    })) {
      slots.push(slot);
      if (slots.length >= limit) break;
    }
  }

  return slots;
}

/**
 * Sélection de 3 créneaux à proposer : on étale sur des jours différents quand c'est
 * possible (l'appelant choisit plus facilement entre « mardi » et « jeudi »).
 */
export function pickProposedSlots(slots: Date[], count = 3): Date[] {
  const byDay = new Map<string, Date>();
  for (const s of slots) {
    const d = zonedCalendarDay(s);
    const key = `${d.year}-${d.month}-${d.day}`;
    if (!byDay.has(key)) byDay.set(key, s);
    if (byDay.size >= count) break;
  }
  const picked = [...byDay.values()];
  for (const s of slots) {
    if (picked.length >= count) break;
    if (!picked.some((p) => p.getTime() === s.getTime())) picked.push(s);
  }
  return picked.sort((a, b) => a.getTime() - b.getTime()).slice(0, count);
}

/** Libellé oral d'un créneau : « mardi 6 octobre à 17 h 30 ». */
export function formatSlotForSpeech(slot: Date): string {
  const date = new Intl.DateTimeFormat("fr-FR", {
    timeZone: VISIT_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(slot);
  const time = new Intl.DateTimeFormat("fr-FR", {
    timeZone: VISIT_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  })
    .format(slot)
    .replace(":", " h ")
    .replace(" h 00", " h");
  return `${date} à ${time}`;
}
