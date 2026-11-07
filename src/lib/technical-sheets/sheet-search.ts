import type { TechnicalSheetContent } from "@/lib/technical-sheets/types";
import { foldSearchText } from "@/lib/work-library/platform-catalog-search";

/**
 * Recherche plein texte dans les fiches (utilisable côté client) : un mot est trouvé
 * s'il apparaît n'importe où dans la fiche (titre, étapes, matériel, sécurité, normes…).
 */

/** Tous les textes d'une fiche, dans l'ordre de lecture (sans le titre). */
export function sheetTextSegments(sheet: TechnicalSheetContent & { keywords?: string[] }): string[] {
  return [
    sheet.summary,
    ...(sheet.keywords ?? []),
    ...sheet.safety,
    ...sheet.tools,
    ...sheet.materials,
    ...sheet.steps.flatMap((step) => [step.title, ...step.details, ...(step.warning ? [step.warning] : [])]),
    ...sheet.checks,
    ...sheet.norms.map((norm) => `${norm.ref} — ${norm.label}`),
  ].filter(Boolean);
}

export function searchTerms(query: string): string[] {
  return [...new Set(foldSearchText(query).replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((t) => t.length > 1))];
}

export type SheetSearchHit = {
  /** Le titre contient tous les mots (fiche « spécifique »). */
  inTitle: boolean;
  /** Extrait où apparaissent les mots (null si seul le titre correspond). */
  excerpt: string | null;
  score: number;
};

/** null si un des mots est absent de la fiche. */
export function matchSheetText(title: string, segments: string[], terms: string[]): SheetSearchHit | null {
  if (terms.length === 0) return null;
  const foldedTitle = foldSearchText(title);
  const folded = segments.map(foldSearchText);
  const all = `${foldedTitle} ${folded.join(" ")}`;
  if (!terms.every((term) => all.includes(term))) return null;

  const titleHits = terms.filter((term) => foldedTitle.includes(term)).length;
  let best = -1;
  let bestHits = 0;
  folded.forEach((segment, index) => {
    const hits = terms.filter((term) => segment.includes(term)).length;
    if (hits > bestHits) {
      best = index;
      bestHits = hits;
    }
  });
  const occurrences = terms.reduce((sum, term) => sum + all.split(term).length - 1, 0);
  return {
    inTitle: titleHits === terms.length,
    excerpt: titleHits === terms.length || best < 0 ? null : segments[best]!,
    score: titleHits * 100 + occurrences,
  };
}

/** Découpe un texte pour surligner les mots cherchés (comparaison sans accents). */
export function highlightParts(text: string, terms: string[]): { text: string; match: boolean }[] {
  if (terms.length === 0) return [{ text, match: false }];
  // Repli caractère par caractère : la longueur reste identique au texte d'origine.
  const folded = Array.from(text, (char) => foldSearchText(char) || char).join("");
  if (folded.length !== text.length) return [{ text, match: false }];
  const marks = new Array<boolean>(text.length).fill(false);
  for (const term of terms) {
    let from = 0;
    for (let at = folded.indexOf(term, from); at >= 0; at = folded.indexOf(term, from)) {
      for (let i = at; i < at + term.length; i++) marks[i] = true;
      from = at + term.length;
    }
  }
  const parts: { text: string; match: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last.match === marks[i]) last.text += text[i];
    else parts.push({ text: text[i]!, match: marks[i]! });
  }
  return parts;
}
