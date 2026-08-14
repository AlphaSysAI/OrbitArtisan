import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { LeadQualification } from "@/lib/ai/qualify-lead-schema";
import type { LeadEstimate } from "@/lib/leads/types";

/**
 * Transformation d'une analyse IA en fourchette de prix.
 *
 * Le taux horaire vient d'abord des artisans réellement candidats (leur
 * `labor_rate_per_hour`, en centimes). Sans donnée, on retombe sur une grille
 * de référence par catégorie de métier.
 */

/** Taux horaire moyen constaté en France, en euros, par catégorie de métier. */
const REFERENCE_HOURLY_RATE_EUR: Record<string, number> = {
  "plomberie-chauffage": 55,
  electricite: 55,
  "energies-renouvelables": 60,
  "gros-oeuvre": 50,
  couverture: 55,
  "second-oeuvre": 45,
  "menuiseries-exterieures": 50,
  "piscine-spa": 55,
  "amenagement-exterieur": 40,
  "travaux-publics": 60,
  "renovation-specialisee": 50,
  "pierre-patrimoine": 60,
  "conception-encadrement": 70,
  autre: 45,
};

const DEFAULT_HOURLY_RATE_EUR = 50;

/**
 * Écart minimal entre les deux bornes. C'est un plancher, pas un multiplicateur :
 * quand l'IA donne déjà une fourchette d'heures large, on ne la gonfle pas une
 * seconde fois.
 */
const MIN_SPREAD: Record<LeadQualification["complexity"], number> = {
  simple: 1.4,
  moyenne: 1.6,
  elevee: 1.9,
};

/** Un déplacement facturé au minimum : personne ne se déplace pour une heure sèche. */
const MIN_BILLABLE_HOURS = 1.5;

export type PricingContext = {
  hourlyRateEur: number;
  /** D'où vient le taux : tarifs réels des candidats ou grille de référence. */
  source: "artisans" | "reference";
  sampleSize: number;
};

export async function resolvePricingContext(
  supabase: SupabaseClient,
  input: { artisanIds: string[]; categoryId: string | null },
): Promise<PricingContext> {
  const fallback: PricingContext = {
    hourlyRateEur: REFERENCE_HOURLY_RATE_EUR[input.categoryId ?? ""] ?? DEFAULT_HOURLY_RATE_EUR,
    source: "reference",
    sampleSize: 0,
  };

  if (!input.artisanIds.length) return fallback;

  const { data, error } = await supabase
    .from("profiles")
    .select("labor_rate_per_hour")
    .in("id", input.artisanIds);

  if (error) {
    console.error("[pricing] taux artisans", error.message);
    return fallback;
  }

  // Les taux sont stockés en centimes ; on ignore les valeurs manifestement fausses.
  const rates = (data ?? [])
    .map((row) => Number(row.labor_rate_per_hour))
    .filter((cents) => Number.isFinite(cents) && cents > 0)
    .map((cents) => cents / 100)
    .filter((eur) => eur >= 15 && eur <= 250);

  if (!rates.length) return fallback;

  const average = rates.reduce((sum, r) => sum + r, 0) / rates.length;
  return {
    hourlyRateEur: Math.round(average),
    source: "artisans",
    sampleSize: rates.length,
  };
}

function roundTo(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

export function buildEstimate(
  qualification: LeadQualification,
  pricing: PricingContext,
): LeadEstimate {
  const rate = pricing.hourlyRateEur;

  // La part matériaux est exprimée en fraction du total, d'où la division.
  const materialFactor = 1 / (1 - qualification.material_cost_share);
  // Demande floue : on assume l'incertitude en élargissant plutôt qu'en trompant.
  const vague = qualification.confidence === "faible";

  const rawMin =
    Math.max(qualification.estimated_hours_min, MIN_BILLABLE_HOURS) * rate * materialFactor;
  const rawMax = qualification.estimated_hours_max * rate * materialFactor;

  const min = roundTo(rawMin * (vague ? 0.85 : 1), 10);
  const max = roundTo(
    Math.max(rawMax * (vague ? 1.25 : 1), min * MIN_SPREAD[qualification.complexity]),
    50,
  );

  const rateBasis =
    pricing.source === "artisans"
      ? `taux horaire moyen de ${rate} €/h relevé chez ${pricing.sampleSize} artisan${pricing.sampleSize > 1 ? "s" : ""} près de toi`
      : `taux horaire de référence de ${rate} €/h pour ce métier`;

  const hoursBasis =
    qualification.estimated_hours_min === qualification.estimated_hours_max
      ? `${qualification.estimated_hours_max} h de travail estimées`
      : `${qualification.estimated_hours_min} à ${qualification.estimated_hours_max} h de travail estimées`;

  return {
    min,
    max,
    basis: vague
      ? `${hoursBasis}, ${rateBasis}. Fourchette large : ta description manque encore de détails.`
      : `${hoursBasis}, ${rateBasis}.`,
  };
}
