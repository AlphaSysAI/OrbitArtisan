/**
 * Montants en euros, format français (« 1 234,56 € »). Affichage uniquement :
 * les calculs restent en centimes entiers, jamais sur la chaîne formatée.
 */
const EUR = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** Montant en euros (nombre décimal). */
export function formatEuros(euros: number): string {
  return EUR.format(euros);
}

/** Montant en centimes (colonnes *_cents, totaux HT/TTC) ; null/undefined → 0 €. */
export function formatCents(cents: number | null | undefined): string {
  return EUR.format((cents ?? 0) / 100);
}
