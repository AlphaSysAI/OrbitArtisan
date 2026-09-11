/**
 * Assainissement du texte destiné aux polices standard de pdf-lib.
 *
 * Les polices Helvetica/Times intégrées utilisent l'encodage WinAnsi (CP1252)
 * et `drawText` lève une exception sur tout caractère hors de cette table.
 * Or `Intl.NumberFormat("fr-FR")` sépare les milliers par une ESPACE FINE
 * INSÉCABLE (U+202F) depuis les versions récentes d'ICU : sans conversion,
 * tout montant ≥ 1 000 € casse la génération du document.
 */

/** Caractères CP1252 de la plage 0x80–0x9F, absents de Latin-1. */
const CP1252_EXTRAS = new Set(
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split(""),
);

/** Substitutions explicites des caractères couramment produits par Intl / la saisie. */
const REPLACEMENTS: Record<string, string> = {
  "\u202F": " ", // espace fine insécable (séparateur de milliers fr-FR)
  "\u2009": " ", // espace fine
  "\u2007": " ", // espace numérique
  "\u2060": "", // gluon de mots
  "\u200B": "", // espace sans largeur
  "\uFEFF": "", // BOM
  "\u2011": "-", // trait d'union insécable
  "\u2212": "-", // signe moins
  "\u2044": "/", // barre de fraction
};

function isWinAnsiEncodable(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  // ASCII imprimable et supplément Latin-1 (dont l'espace insécable U+00A0).
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0xff) return true;
  return CP1252_EXTRAS.has(char);
}

/**
 * Rend une chaîne sûre pour `PDFPage.drawText` avec une police standard.
 * Les caractères non encodables sont remplacés plutôt que de faire échouer
 * la génération : un document légèrement dégradé vaut mieux qu'aucun document.
 */
export function sanitizePdfText(value: string): string {
  let out = "";

  for (const char of value.normalize("NFC")) {
    const replacement = REPLACEMENTS[char];
    if (replacement !== undefined) {
      out += replacement;
      continue;
    }
    out += isWinAnsiEncodable(char) ? char : "?";
  }

  return out;
}

/** Montant en centimes formaté en euros, encodable en WinAnsi. */
export function formatEurosForPdf(cents: number): string {
  return sanitizePdfText(
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100),
  );
}

/** Date formatée en français long, encodable en WinAnsi. */
export function formatDateForPdf(date: Date): string {
  return sanitizePdfText(new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date));
}
