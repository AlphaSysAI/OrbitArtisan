/**
 * Pont entre le formulaire de devis ouvert et l'assistant flottant : tant qu'un devis
 * rempli est à l'écran, les consignes de l'assistant le MODIFIENT (opérations ciblées)
 * au lieu de régénérer un devis complet (et de relancer les recherches de prix).
 */

export type QuoteEditorOutcome =
  | { ok: true; changes: string[]; warnings: string[] }
  | { ok: false; message: string };

type QuoteEditor = (instruction: string) => Promise<QuoteEditorOutcome>;

let current: QuoteEditor | null = null;

export function registerQuoteEditor(editor: QuoteEditor): () => void {
  current = editor;
  return () => {
    if (current === editor) current = null;
  };
}

export function getQuoteEditor(): QuoteEditor | null {
  return current;
}

/** « nouveau devis », « autre client »… : l'artisan veut repartir de zéro, pas modifier. */
export function wantsNewQuote(message: string): boolean {
  const m = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  return /\b(nouveau devis|nouvel devis|autre devis|un autre client|recommence|repars de zero|refais (tout|le devis))\b/.test(m);
}
