import "server-only";

import type { LeadQualification } from "@/lib/ai/qualify-lead-schema";
import type { LeadEstimate } from "@/lib/leads/types";
import { isWholeHouseMasonryProject } from "@/lib/ai/quote-material-takeoff";

/** Surface au sol citée (m²), si plausible. */
export function extractSurfaceM2(text: string): number | null {
  const normalized = text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const match = normalized.match(/(\d{1,4})\s*(?:m2|m²|metres?\s*carres?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 1 && value <= 2000 ? value : null;
}

/** Gros œuvre structurel complet (plancher, murs, toiture…) sur surface connue. */
export function isStructuralShellProject(text: string): boolean {
  const normalized = text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  if (!extractSurfaceM2(text)) return false;

  const shell =
    /plancher|dalle|murs?\s+porteurs?|toiture|charpente|gros\s+[oe]uvre|structure|maison\s+neuve|construction|extension/i.test(
      normalized,
    );
  return shell || isWholeHouseMasonryProject(text);
}

/** €/m² HT indicatifs pour enveloppe structurelle maçonnerie (plancher + murs + couverture). */
const SHELL_EUR_PER_M2: [number, number] = [320, 650];

/** Heures MO cumulées (équipe) par m² de surface au sol — fourchette basse/haute. */
const SHELL_HOURS_PER_M2: [number, number] = [3.5, 9];

function roundTo(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

/**
 * Rehausse les heures IA quand le modèle sous-estime un chantier lourd
 * (ex. maison 125 m² traitée comme un dépannage).
 */
export function enforceQualificationScale(
  qualification: LeadQualification,
  description: string,
): LeadQualification {
  const surface = extractSurfaceM2(description);
  if (!surface || !isStructuralShellProject(description)) return qualification;

  const [hoursPerM2Min, hoursPerM2Max] = SHELL_HOURS_PER_M2;
  const floorMin = Math.round(surface * hoursPerM2Min);
  const floorMax = Math.round(surface * hoursPerM2Max);

  qualification.estimated_hours_min = Math.max(qualification.estimated_hours_min, floorMin);
  qualification.estimated_hours_max = Math.max(
    qualification.estimated_hours_max,
    floorMax,
    Math.round(qualification.estimated_hours_min * 1.6),
  );
  qualification.complexity = "elevee";
  qualification.material_cost_share = Math.max(qualification.material_cost_share, 0.55);
  if (qualification.confidence === "faible") qualification.confidence = "moyenne";

  return qualification;
}

/** Plancher € sur la fourchette finale pour les chantiers à l'échelle d'une maison. */
export function applyStructuralShellEstimateFloor(
  estimate: LeadEstimate,
  description: string,
): LeadEstimate {
  const surface = extractSurfaceM2(description);
  if (!surface || !isStructuralShellProject(description)) return estimate;

  const [eurMin, eurMax] = SHELL_EUR_PER_M2;
  const floorMin = roundTo(surface * eurMin, 500);
  const floorMax = roundTo(surface * eurMax, 1000);

  const min = Math.max(estimate.min, floorMin);
  const max = Math.max(estimate.max, floorMax, Math.round(min * 1.5));

  return {
    min,
    max,
    basis: `${estimate.basis} Fourchette calibrée sur ~${surface} m² au sol (gros œuvre structurel).`,
  };
}

/** Heuristique sans IA : fourchette surface × €/m² pour gros chantiers. */
export function surfaceShellEstimate(input: {
  description: string;
  mediaCount: number;
}): LeadEstimate | null {
  const surface = extractSurfaceM2(input.description);
  if (!surface || !isStructuralShellProject(input.description)) return null;

  const [eurMin, eurMax] = SHELL_EUR_PER_M2;
  return {
    min: roundTo(surface * eurMin, 500),
    max: roundTo(surface * eurMax, 1000),
    basis: `Estimation basée sur ~${surface} m² au sol pour un lot structurel (plancher, murs porteurs, toiture). Fourchette indicative — devis détaillé après étude.`,
  };
}
