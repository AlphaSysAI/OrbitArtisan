import type { LibraryTechnicalSheet } from "@/lib/technical-sheets/types";

import { CARRELAGE_SHEETS } from "./carrelage";
import { ELECTRICITE_SHEETS } from "./electricite";
import { PEINTURE_SHEETS } from "./peinture";
import { PLAQUISTE_SHEETS } from "./plaquiste";
import { PLOMBERIE_SHEETS } from "./plomberie";

/** Bibliothèque des fiches techniques SolineBTP (relues avant d'être marquées vérifiées). */
export const TECHNICAL_SHEET_LIBRARY: LibraryTechnicalSheet[] = [
  ...ELECTRICITE_SHEETS,
  ...PLOMBERIE_SHEETS,
  ...PLAQUISTE_SHEETS,
  ...CARRELAGE_SHEETS,
  ...PEINTURE_SHEETS,
];
