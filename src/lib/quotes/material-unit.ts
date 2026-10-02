/**
 * Unité marchande d'une ligne de fourniture : forme affichée (devis, facture, PDF)
 * et code UN/ECE Rec. 20 pour le Factur-X (BT-130). Saisie libre tolérée (« sacs »,
 * « rouleaux ») ; null = ancienne ligne sans unité → « u » à l'affichage, C62 en XML.
 */

const MAX_UNIT_LENGTH = 30;

function fold(raw: string): string {
  return raw.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim().replace(/\.$/, "");
}

/** Forme canonique stockée : « U », « m² », « ml », « m³ », « kg », « L », « h », « sacs »… */
export function normalizeMaterialUnit(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!value) return null;
  const key = fold(value);
  if (/^(u|un|unite|unites|piece|pieces|pce|pcs)$/.test(key)) return "U";
  if (/^m2$/.test(key)) return "m²";
  if (/^m3$/.test(key)) return "m³";
  if (/^(ml|m lineaires?|metres? lineaires?)$/.test(key)) return "ml";
  if (/^(kg|kilos?|kilogrammes?)$/.test(key)) return "kg";
  if (/^(l|litres?)$/.test(key)) return "L";
  if (/^(h|heures?)$/.test(key)) return "h";
  if (/^sacs?$/.test(key)) return "sacs";
  if (/^rouleaux?$/.test(key)) return "rouleaux";
  if (/^boites?$/.test(key)) return "boîtes";
  return value.slice(0, MAX_UNIT_LENGTH);
}

/** Libellé court du PDF (colonne quantité). */
export function materialUnitLabel(unit: string | null | undefined): string {
  return normalizeMaterialUnit(unit) ?? "u";
}

/** Code UN/ECE Rec. 20 (EN16931 BT-130) ; conditionnements et inconnus : C62 (« unité »). */
export function uneceUnitCode(unit: string | null | undefined): string {
  switch (normalizeMaterialUnit(unit)) {
    case "m²":
      return "MTK";
    case "m³":
      return "MTQ";
    case "ml":
      return "MTR";
    case "kg":
      return "KGM";
    case "L":
      return "LTR";
    case "h":
      return "HUR";
    case "jour":
      return "DAY";
    case "forfait":
      return "LS";
    default:
      return "C62";
  }
}
