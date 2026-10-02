export const WORK_UNITS = ["m²", "ml", "m³", "U", "forfait", "h", "jour"] as const;

type WorkUnit = (typeof WORK_UNITS)[number];

export const VAT_RATES = [5.5, 10, 20] as const;

export type VatRate = (typeof VAT_RATES)[number];

export function isWorkUnit(value: string): value is WorkUnit {
  return (WORK_UNITS as readonly string[]).includes(value);
}

/** 0 accepté : franchise en base (293 B). La base remet 20 % si l'entreprise n'est pas en franchise. */
export function isVatRate(value: number): value is VatRate {
  return value === 0 || (VAT_RATES as readonly number[]).includes(value);
}
