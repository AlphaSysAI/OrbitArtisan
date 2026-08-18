export const WORK_UNITS = ["m²", "ml", "m³", "U", "forfait", "h", "jour"] as const;

export type WorkUnit = (typeof WORK_UNITS)[number];

export const VAT_RATES = [5.5, 10, 20] as const;

export type VatRate = (typeof VAT_RATES)[number];

export function isWorkUnit(value: string): value is WorkUnit {
  return (WORK_UNITS as readonly string[]).includes(value);
}

export function isVatRate(value: number): value is VatRate {
  return (VAT_RATES as readonly number[]).includes(value);
}
