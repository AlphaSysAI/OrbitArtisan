import { normalizePhoneE164 } from "@/lib/voice/twilio-minutes";

/**
 * Téléphone du client pour une réservation vitrine : obligatoire pour que l'artisan
 * puisse rappeler. Accepte les saisies courantes (06 12 34 56 78, +33 6…, 0033 6…,
 * numéros étrangers en +XX) et renvoie un format E.164, ou null si invalide.
 */
export function normalizeCustomerPhone(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const e164 = normalizePhoneE164(value);
  if (!/^\+\d{8,15}$/.test(e164)) return null;
  if (e164.startsWith("+33") && e164.length !== 12) return null; // +33 + 9 chiffres
  return e164;
}
