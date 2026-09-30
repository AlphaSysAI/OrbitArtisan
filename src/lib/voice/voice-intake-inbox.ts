/** Onglets de la page « Appels Soline ». */
export const VOICE_INBOX_TABS = ["a_traiter", "devis", "archives"] as const;
export type VoiceInboxTab = (typeof VOICE_INBOX_TABS)[number];

export const VOICE_INBOX_PAGE_SIZE = 30;
export const VOICE_INBOX_MAX_LIMIT = 300;

export function parseVoiceInboxTab(raw: string | string[] | undefined): VoiceInboxTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (VOICE_INBOX_TABS as readonly string[]).includes(v ?? "") ? (v as VoiceInboxTab) : "a_traiter";
}

export function parseVoiceInboxLimit(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(n) || n <= 0) return VOICE_INBOX_PAGE_SIZE;
  return Math.min(Math.ceil(n / VOICE_INBOX_PAGE_SIZE) * VOICE_INBOX_PAGE_SIZE, VOICE_INBOX_MAX_LIMIT);
}

/**
 * Recherche par nom / e-mail / résumé, ou par numéro saisi « à la française »
 * (06 12 34…) alors que la base stocke du E.164 (+336 12 34…).
 * Retourne des fragments sûrs pour PostgREST (lettres, chiffres, espaces, @ + -).
 */
export function buildVoiceInboxSearch(raw: string | string[] | undefined): {
  text: string | null;
  phoneDigits: string | null;
} {
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 80) ?? "";
  if (!q) return { text: null, phoneDigits: null };

  const compact = q.replace(/[\s.\-()]/g, "");
  if (/^\+?\d{2,}$/.test(compact)) {
    let digits = compact.replace(/^\+/, "");
    if (digits.startsWith("33")) digits = digits.slice(2);
    else if (digits.startsWith("0")) digits = digits.slice(1);
    return { text: null, phoneDigits: digits || null };
  }

  const text = q
    .replace(/\./g, "_") // e-mails : « . » → joker 1 caractère ILIKE, sans syntaxe PostgREST
    .replace(/[^\p{L}\p{N}@+\-_ ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { text: text || null, phoneDigits: null };
}

type AppointmentLike = { id: string; customer_phone: string | null; created_at: string; start_time: string };
type IntakeLike = { id: string; from_number: string | null; created_at: string };

/** RDV pris par Soline pendant l'appel : même numéro, créé dans l'heure qui suit l'appel. */
export function matchVoiceAppointments<A extends AppointmentLike>(
  intakes: IntakeLike[],
  appointments: A[],
): Map<string, A> {
  const out = new Map<string, A>();
  for (const intake of intakes) {
    if (!intake.from_number) continue;
    const t = new Date(intake.created_at).getTime();
    const hit = appointments.find((a) => {
      if (a.customer_phone !== intake.from_number) return false;
      const d = new Date(a.created_at).getTime() - t;
      // L'intake est créé en fin d'appel, le RDV pendant : tolérance ±1 h.
      return Math.abs(d) <= 3_600_000;
    });
    if (hit) out.set(intake.id, hit);
  }
  return out;
}
