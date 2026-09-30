/**
 * Contrôles déterministes des identifiants d'entreprise : ils ne dépendent
 * jamais du LLM. Un SIRET « lu » par l'IA qui échoue ici est rejeté (null).
 */

function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function isValidSiren(value: string | null | undefined): boolean {
  const d = onlyDigits(value);
  return /^\d{9}$/.test(d) && luhnValid(d);
}

/** SIRET : 14 chiffres, clé de Luhn (exception La Poste : somme des chiffres multiple de 5). */
export function isValidSiret(value: string | null | undefined): boolean {
  const d = onlyDigits(value);
  if (!/^\d{14}$/.test(d)) return false;
  if (d.startsWith("356000000")) return [...d].reduce((s, c) => s + Number(c), 0) % 5 === 0;
  return luhnValid(d) && isValidSiren(d.slice(0, 9));
}

/** N° TVA intracommunautaire FR calculé depuis le SIREN (clé = (12 + 3 × (SIREN mod 97)) mod 97). */
export function frenchVatFromSiren(siren: string): string | null {
  const d = onlyDigits(siren);
  if (!isValidSiren(d)) return null;
  const key = (12 + 3 * (Number(d) % 97)) % 97;
  return `FR${String(key).padStart(2, "0")}${d}`;
}

export function isConsistentFrenchVat(vat: string | null | undefined, siren: string | null | undefined): boolean {
  if (!vat || !siren) return false;
  return vat.replace(/\s/g, "").toUpperCase() === frenchVatFromSiren(siren);
}
