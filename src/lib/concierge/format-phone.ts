/** +33612345678 → « 06 12 34 56 78 » ; autres indicatifs inchangés. */
export function formatPhoneFr(e164: string): string {
  return e164.startsWith("+33") ? `0${e164.slice(3)}`.replace(/(\d{2})(?=\d)/g, "$1 ") : e164;
}

/** Mobile français (06 / 07) : seul cas où un SMS peut être reçu. */
export function isFrenchMobile(e164: string): boolean {
  return /^\+33[67]\d{8}$/.test(e164);
}
