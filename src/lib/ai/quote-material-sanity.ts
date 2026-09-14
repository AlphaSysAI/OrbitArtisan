/** Matériaux comptés à l'unité (U) — parpaings, agglos, briques… */
const MASONRY_UNIT_PATTERN =
  /parpaing|agglo|bloc(?:\s+b[ée]ton|\s+creux)?|brique|planelle/i;

/** Ordre de grandeur maison individuelle (murs porteurs), hors cas exceptionnels. */
const MASONRY_TYPICAL_MIN = 500;
const MASONRY_TYPICAL_MAX = 2500;
/** Au-delà : alerte ; correction ×10 si le résultat retombe dans la fourchette type. */
const MASONRY_SUSPICIOUS_MIN = 3000;

export function isMasonryUnitMaterial(name: string): boolean {
  return MASONRY_UNIT_PATTERN.test(name.trim());
}

/**
 * Corrige les sur-quantités manifestes (souvent ×10 sur parpaings)
 * et ajoute des avertissements pour l'artisan.
 */
export function sanitizeMaterialQuantity(
  name: string,
  quantity: number,
): { quantity: number; warnings: string[] } {
  const warnings: string[] = [];
  if (!isMasonryUnitMaterial(name) || !Number.isFinite(quantity) || quantity <= 0) {
    return { quantity, warnings };
  }

  let q = Math.round(quantity);

  if (q >= MASONRY_SUSPICIOUS_MIN) {
    const divided = Math.round(q / 10);
    if (divided >= MASONRY_TYPICAL_MIN && divided <= MASONRY_TYPICAL_MAX) {
      warnings.push(
        `« ${name} » : ${q.toLocaleString("fr-FR")} U → ${divided.toLocaleString("fr-FR")} U (correction probable d'une erreur ×10 — à valider sur chantier).`,
      );
      q = divided;
    } else {
      warnings.push(
        `« ${name} » : ${q.toLocaleString("fr-FR")} U semble très élevé pour une maison standard (ordre de grandeur murs : ${MASONRY_TYPICAL_MIN.toLocaleString("fr-FR")}–${MASONRY_TYPICAL_MAX.toLocaleString("fr-FR")} U).`,
      );
    }
  }

  return { quantity: q, warnings };
}
