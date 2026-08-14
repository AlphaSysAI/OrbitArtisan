import "server-only";

/**
 * Fourchette indicative affichée au prospect en fin de tunnel.
 *
 * Volontairement déterministe et grossière : c'est un ordre de grandeur, pas un
 * chiffrage. Le moteur définitif (tarifs réels des artisans, historique de devis,
 * lecture des photos) remplacera `estimateLeadRange` sans toucher au reste du
 * tunnel — seule cette fonction est appelée par l'action serveur.
 */

export type EstimateRange = {
  /** Euros TTC, arrondis. */
  min: number;
  max: number;
  /** Phrase courte expliquant sur quoi repose la fourchette. */
  basis: string;
};

/** Bande de départ par catégorie de métier, pour une intervention « standard ». */
const CATEGORY_BANDS: Record<string, [number, number]> = {
  "plomberie-chauffage": [150, 600],
  electricite: [150, 700],
  "energies-renouvelables": [3000, 12000],
  "gros-oeuvre": [1500, 9000],
  couverture: [800, 6000],
  "second-oeuvre": [400, 3500],
  "menuiseries-exterieures": [600, 4500],
  "piscine-spa": [2000, 20000],
  "amenagement-exterieur": [500, 5000],
  "travaux-publics": [1500, 12000],
  "renovation-specialisee": [600, 6000],
  "pierre-patrimoine": [1200, 9000],
  "conception-encadrement": [500, 4000],
  autre: [200, 2000],
};

const DEFAULT_BAND: [number, number] = [200, 2000];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Surface en m² citée dans la description, si elle est plausible. */
function extractSurface(text: string): number | null {
  const match = text.match(/(\d{1,4})\s*(?:m2|m²|metres? carres?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 1 && value <= 2000 ? value : null;
}

function roundTo(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

export function estimateLeadRange(input: {
  categoryId: string | null;
  description: string;
  mediaCount: number;
}): EstimateRange {
  const [baseMin, baseMax] = CATEGORY_BANDS[input.categoryId ?? ""] ?? DEFAULT_BAND;
  const text = normalize(input.description);

  let factor = 1;
  const reasons: string[] = [];

  // Dépannage ponctuel : on resserre vers le bas de la bande.
  if (/\b(fuite|repar|depann|urgence|urgent|casse|bouche|panne)\b/.test(text)) {
    factor *= 0.7;
    reasons.push("intervention de dépannage");
  }

  // Travaux lourds : on pousse vers le haut.
  if (/\b(installation|remplacement|renovation|complet|neuf|construction|creation|refaire)\b/.test(text)) {
    factor *= 1.5;
    reasons.push("travaux d’installation ou de rénovation");
  }

  const surface = extractSurface(text);
  if (surface) {
    // Bande calibrée pour ~20 m² : au-delà, on suit la surface de façon amortie.
    factor *= Math.min(4, Math.max(0.5, Math.sqrt(surface / 20)));
    reasons.push(`surface d’environ ${surface} m²`);
  }

  const min = roundTo(baseMin * factor, 10);
  const max = roundTo(Math.max(baseMax * factor, min * 1.8), 50);

  const basis = reasons.length
    ? `Estimation basée sur ta description (${reasons.join(", ")})${input.mediaCount ? ` et ${input.mediaCount} média${input.mediaCount > 1 ? "s" : ""}` : ""}.`
    : "Estimation basée sur le type de travaux décrit.";

  return { min, max, basis };
}
