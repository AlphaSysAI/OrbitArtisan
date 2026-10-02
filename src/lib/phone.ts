/**
 * Téléphones : stockage en E.164 (+33612345678), affichage national français
 * (06 12 34 56 78). Point d'entrée unique — pas de formatage ad hoc ailleurs.
 */

/**
 * Normalisation tolérante vers E.164 (recherche en base, numéros Twilio/ElevenLabs).
 * Ne valide pas : une saisie non reconnue est renvoyée telle quelle ("" si vide).
 */
export function normalizePhoneE164(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return `+${trimmed.slice(1).replace(/\D/g, "")}`;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0") && digits.length === 10) return `+33${digits.slice(1)}`;
  if (digits.length >= 10) return `+${digits}`;
  return trimmed;
}

/**
 * Saisie d'un client (vitrine, réponse devis, fiche client, import) : accepte
 * 06 12 34 56 78, +33 6…, 0033 6…, +XX étranger ; E.164 strict ou null.
 */
export function normalizeCustomerPhone(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const e164 = normalizePhoneE164(value);
  if (!/^\+\d{8,15}$/.test(e164)) return null;
  if (e164.startsWith("+33") && e164.length !== 12) return null; // +33 + 9 chiffres
  return e164;
}

/** +33612345678 → « 0612345678 » ; autres indicatifs inchangés ; vide → "". */
export function nationalPhoneFr(e164: string | null | undefined): string {
  const p = e164?.trim() ?? "";
  return p.startsWith("+33") && p.length === 12 ? `0${p.slice(3)}` : p;
}

/** +33612345678 → « 06 12 34 56 78 » ; autres indicatifs inchangés ; vide → "". */
export function formatPhoneFr(e164: string | null | undefined): string {
  const national = nationalPhoneFr(e164);
  return /^0\d{9}$/.test(national) ? national.replace(/(\d{2})(?=\d)/g, "$1 ") : national;
}

/** Mobile français (06 / 07) : seul cas où un SMS peut être reçu. */
export function isFrenchMobile(e164: string): boolean {
  return /^\+33[67]\d{8}$/.test(e164);
}
