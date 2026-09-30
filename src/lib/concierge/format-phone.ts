/** +33612345678 → « 06 12 34 56 78 » ; autres indicatifs inchangés. */
export function formatPhoneFr(e164: string): string {
  return e164.startsWith("+33") ? `0${e164.slice(3)}`.replace(/(\d{2})(?=\d)/g, "$1 ") : e164;
}
