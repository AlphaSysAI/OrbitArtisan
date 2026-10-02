/**
 * Moteur de calculs géométriques et ratios physiques BTP France (DTU).
 * Toutes les dimensions d'entrée sont en mètres ou mètres carrés.
 * Fonctions pures : le LLM ne calcule jamais une surface ou un périmètre lui-même.
 */

export interface HouseWallDimensions {
  perimeterLinearMeters: number; // Périmètre développé des façades (ml)
  grossWallAreaM2: number; // Surface brute des murs extérieurs (m²)
  openingsAreaM2: number; // Surface des baies/menuiseries déduites (m²)
  netWallAreaM2: number; // Surface nette de maçonnerie/façade à monter (m²)
}

const round1 = (n: number) => Math.round(Number((n * 10).toFixed(6))) / 10;
const round2 = (n: number) => Math.round(Number((n * 100).toFixed(6))) / 100;

/**
 * Dimensions des murs périphériques à partir de la surface au sol.
 * Maison individuelle (rapport longueur/largeur ~1:1,3, décrochements ~8 %) :
 * Périmètre (ml) = 4 × √(surface sol) × 1,08 ; ouvertures déduites : 18 % par défaut.
 */
export function estimateHouseWallDimensions(
  groundAreaM2: number,
  ceilingHeightMeters = 2.5,
  openingsRatio = 0.18,
): HouseWallDimensions {
  if (!(groundAreaM2 > 0)) {
    return { perimeterLinearMeters: 0, grossWallAreaM2: 0, openingsAreaM2: 0, netWallAreaM2: 0 };
  }
  const perimeter = round1(4 * Math.sqrt(groundAreaM2) * 1.08);
  const grossArea = round1(perimeter * ceilingHeightMeters);
  const openingsArea = round1(grossArea * openingsRatio);
  const netArea = round1(grossArea - openingsArea);
  return {
    perimeterLinearMeters: perimeter,
    grossWallAreaM2: grossArea,
    openingsAreaM2: openingsArea,
    netWallAreaM2: netArea,
  };
}

/**
 * Surface développée de toiture (rampants) à partir de l'emprise au sol.
 * Facteur de pente = 1 / cos(atan(pente)) ; débords de toit inclus (+12 % par défaut).
 */
export function estimateRoofAreaFromFootprint(
  groundAreaM2: number,
  slopePercentage = 35,
  roofOverhangFactor = 1.12,
): number {
  if (!(groundAreaM2 > 0)) return 0;
  const slopeFactor = 1 / Math.cos(Math.atan(slopePercentage / 100));
  return round1(groundAreaM2 * roofOverhangFactor * slopeFactor);
}

/**
 * Surface des murs intérieurs d'une pièce (peinture, doublage) :
 * périmètre ≈ 4 × √S × 1,05, × hauteur, −10 % d'ouvertures.
 */
export function estimateRoomWallArea(roomFloorAreaM2: number, ceilingHeight = 2.5): number {
  if (!(roomFloorAreaM2 > 0)) return 0;
  const perimeter = 4 * Math.sqrt(roomFloorAreaM2) * 1.05;
  return round1(perimeter * ceilingHeight * 0.9);
}

/** Volume de béton (dallage, chape) : surface × épaisseur × 1,05 (pertes). */
export function estimateConcreteVolumeM3(areaM2: number, thicknessMeters: number): number {
  if (!(areaM2 > 0) || !(thicknessMeters > 0)) return 0;
  return round2(areaM2 * thicknessMeters * 1.05);
}
