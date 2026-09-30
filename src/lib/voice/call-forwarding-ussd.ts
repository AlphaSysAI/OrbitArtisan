import { normalizePhoneE164 } from "@/lib/voice/twilio-minutes";

/** Chiffres nationaux FR (0XXXXXXXXX) pour composition USSD depuis le portable. */
export function phoneToNationalUssdDigits(phone: string | null | undefined): string | null {
  const raw = phone?.trim();
  if (!raw) return null;
  const e164 = normalizePhoneE164(raw);
  if (!e164) return null;
  if (e164.startsWith("+33") && e164.length >= 12) {
    return `0${e164.slice(3)}`;
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) return digits;
  return digits.length >= 9 ? digits : null;
}

/** Code d'activation renvoi (opérateurs FR courants) : *61*<numéro Soline>*11*12# */
export function buildActivateCallForwardingCode(forwardToNumber: string): string | null {
  const national = phoneToNationalUssdDigits(forwardToNumber);
  if (!national) return null;
  return `*61*${national}*11*12#`;
}

/** Annule tous les renvois d'appel sur la ligne. */
export const CANCEL_CALL_FORWARDING_CODE = "##002#";

/** Lien `tel:` pour composer un code USSD (encode # pour iOS/Android). */
export function ussdToTelHref(code: string): string {
  return `tel:${code.replace(/#/g, "%23")}`;
}
