/**
 * Catalogue Soline étendu (≈ 1 800 ouvrages, 13 familles de métiers).
 * Prix indicatifs France 2025-2026 (fourni posé), TVA par défaut à confirmer par l'artisan.
 */
import { CATALOG_AMENAGEMENT_EXTERIEUR } from "./amenagement-exterieur";
import { CATALOG_CONCEPTION_ENCADREMENT } from "./conception-encadrement";
import { CATALOG_COUVERTURE } from "./couverture";
import { CATALOG_ELECTRICITE } from "./electricite";
import { CATALOG_ENERGIES_RENOUVELABLES } from "./energies-renouvelables";
import { CATALOG_GROS_OEUVRE } from "./gros-oeuvre";
import { CATALOG_MENUISERIES_EXTERIEURES } from "./menuiseries-exterieures";
import { CATALOG_PIERRE_PATRIMOINE } from "./pierre-patrimoine";
import { CATALOG_PISCINE_SPA } from "./piscine-spa";
import { CATALOG_PLOMBERIE_CHAUFFAGE } from "./plomberie-chauffage";
import { CATALOG_RENOVATION_SPECIALISEE } from "./renovation-specialisee";
import { CATALOG_SECOND_OEUVRE } from "./second-oeuvre";
import { CATALOG_TRAVAUX_PUBLICS } from "./travaux-publics";

export const PLATFORM_WORK_CATALOG_V2 = [
  ...CATALOG_GROS_OEUVRE,
  ...CATALOG_COUVERTURE,
  ...CATALOG_SECOND_OEUVRE,
  ...CATALOG_PLOMBERIE_CHAUFFAGE,
  ...CATALOG_ELECTRICITE,
  ...CATALOG_ENERGIES_RENOUVELABLES,
  ...CATALOG_MENUISERIES_EXTERIEURES,
  ...CATALOG_PISCINE_SPA,
  ...CATALOG_AMENAGEMENT_EXTERIEUR,
  ...CATALOG_TRAVAUX_PUBLICS,
  ...CATALOG_RENOVATION_SPECIALISEE,
  ...CATALOG_PIERRE_PATRIMOINE,
  ...CATALOG_CONCEPTION_ENCADREMENT,
];
