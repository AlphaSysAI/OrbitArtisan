import { CLIENT_SHEETS_EAU } from "@/lib/technical-sheets/client/library-eau";
import { CLIENT_SHEETS_ENERGIE } from "@/lib/technical-sheets/client/library-energie";
import { CLIENT_SHEETS_HABITAT } from "@/lib/technical-sheets/client/library-habitat";
import type { ClientTechnicalSheet } from "@/lib/technical-sheets/client/types";

export { CLIENT_LEVEL_LABEL } from "@/lib/technical-sheets/client/types";

/** Fiches dépannage des particuliers (espace client). Identifiants préfixés « client- ». */
export const CLIENT_SHEET_LIBRARY: ClientTechnicalSheet[] = [
  ...CLIENT_SHEETS_EAU,
  ...CLIENT_SHEETS_ENERGIE,
  ...CLIENT_SHEETS_HABITAT,
];

export function getClientSheet(id: string): ClientTechnicalSheet | null {
  return CLIENT_SHEET_LIBRARY.find((sheet) => sheet.id === id) ?? null;
}

/** Ordre d'affichage : urgences d'abord, puis petits dépannages, puis bricolage. */
const LEVEL_ORDER = { urgence: 0, facile: 1, bricolage: 2 } as const;

export function sortClientSheets(sheets: ClientTechnicalSheet[]): ClientTechnicalSheet[] {
  return [...sheets].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

export const CLIENT_SHEET_DISCLAIMER =
  "Ces fiches vous aident à sécuriser votre logement et à faire de petits dépannages. Au moindre doute, ne prenez aucun risque : faites appel à un professionnel. Urgences : 112 ou 18 (pompiers) · gaz : 0 800 47 33 33.";
