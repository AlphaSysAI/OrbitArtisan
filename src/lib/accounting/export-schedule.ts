/**
 * Calendrier de l'envoi comptable (heure de Paris) et règles de découpage des e-mails.
 * Sans dépendance serveur : testable et utilisable côté client.
 */

const ACCOUNTING_TIMEZONE = "Europe/Paris";
export const ACCOUNTING_UPLOADS_BUCKET = "accounting-uploads";
/** Préavis avant l'envoi (jours). */
const ACCOUNTING_NOTICE_DAYS_BEFORE = 2;
/** Limite d'une pièce ajoutée, après compression (identique au bucket). */
export const ACCOUNTING_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
/** Photos réduites côté navigateur avant envoi : ticket lisible, ~300-800 Ko. */
const ACCOUNTING_IMAGE_MAX_SIDE_PX = 2000;
export const ACCOUNTING_IMAGE_JPEG_QUALITY = 0.82;
/** Pièces en attente max par artisan. */
export const ACCOUNTING_UPLOAD_MAX_FILES = 40;
/** Taille brute max des pièces jointes d'un e-mail (Resend : 40 Mo encodés en base64). */
const ACCOUNTING_EMAIL_MAX_BYTES = 25 * 1024 * 1024;
/** Pièces ajoutées jamais envoyées (envoi désactivé) : purgées au-delà. */
export const ACCOUNTING_UPLOAD_RETENTION_DAYS = 45;

export const ACCOUNTING_ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

type ParisDay = { year: number; month: number; day: number; lastDay: number };

export function parisDay(now: Date): ParisDay {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ACCOUNTING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const year = get("year");
  const month = get("month");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, day: get("day"), lastDay };
}

/** Clé de période : premier jour du mois, « AAAA-MM-01 ». */
export function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function previousPeriodKey(year: number, month: number): string {
  return month === 1 ? periodKey(year - 1, 12) : periodKey(year, month - 1);
}

/** Ce que le cron quotidien doit faire aujourd'hui pour le mois en cours. */
export function accountingActionForDay(d: ParisDay): "notice" | "send" | null {
  if (d.day === d.lastDay) return "send";
  if (d.day === d.lastDay - ACCOUNTING_NOTICE_DAYS_BEFORE) return "notice";
  return null;
}

/** Date d'envoi prévue du mois en cours, libellé français (« jeudi 30 octobre »). */
export function nextSendLabel(now: Date): string {
  const d = parisDay(now);
  const noonUtc = new Date(Date.UTC(d.year, d.month - 1, d.lastDay, 12));
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: ACCOUNTING_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(noonUtc);
}

export function periodLabel(periodStart: string): string {
  const [y, m] = periodStart.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 15)),
  );
}

/** Nom de fichier sûr pour le stockage et les pièces jointes. */
export function sanitizeAccountingFilename(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+/, "");
  return (cleaned || "piece").slice(-100);
}

/** Chemin de stockage : « <profileId>/<horodatage>-<aléa>-<nom> ». */
export function buildAccountingUploadPath(profileId: string, originalName: string, now = Date.now(), random = "") {
  return `${profileId}/${now}-${random || Math.random().toString(36).slice(2, 8)}-${sanitizeAccountingFilename(originalName)}`;
}

/** Nom lisible d'une pièce à partir de son nom de stockage. */
export function displayNameFromStorageName(storageName: string): string {
  const base = storageName.split("/").pop() ?? storageName;
  return base.replace(/^\d+-[a-z0-9]+-/i, "");
}

type SizedItem = { size: number };

/** Dimensions cibles d'une photo réduite (ratio conservé, jamais agrandie). */
export function scaledImageSize(
  width: number,
  height: number,
  maxSide = ACCOUNTING_IMAGE_MAX_SIDE_PX,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide || longest <= 0) return { width, height };
  const ratio = maxSide / longest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

/** Nom d'une photo convertie en JPEG. */
export function jpegFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "photo"}.jpg`;
}

/**
 * Répartit les pièces jointes en e-mails successifs sous la limite de taille,
 * dans l'ordre fourni. Une pièce plus grosse que la limite part seule.
 */
export function batchBySize<T extends SizedItem>(items: T[], maxBytes = ACCOUNTING_EMAIL_MAX_BYTES): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let currentSize = 0;
  for (const item of items) {
    if (current.length > 0 && currentSize + item.size > maxBytes) {
      batches.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(item);
    currentSize += item.size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
