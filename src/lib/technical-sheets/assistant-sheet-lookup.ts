import { sheetMatchesTrade } from "@/lib/technical-sheets/catalog";
import { TECHNICAL_SHEET_LIBRARY } from "@/lib/technical-sheets/library";
import type { LibraryTechnicalSheet } from "@/lib/technical-sheets/types";
import { foldSearchText } from "@/lib/work-library/platform-catalog-search";

/**
 * Assistant : reconnaître une demande de fiche technique (« montre-moi la fiche tableau
 * électrique », « comment je pose un receveur extra-plat ? ») et retrouver les fiches.
 * Sans appel au modèle : recherche déterministe dans la bibliothèque.
 */

const SHEET_WORD = /\bfiches?\s+(technique|techniques|pratique|chantier)s?\b|\bfiche\b.*\b(pour|sur|de|du|des|d)\b|\b(mode operatoire|procedure|tuto|tutoriel|pas a pas|etapes? (pour|de))\b/;
const HOW_TO = /\b(comment|quelles? (sont les )?etapes)\b.*\b(poser|pose|installer|installe|raccorder|raccorde|monter|monte|remplacer|remplace|changer|change|faire|realiser|cabler|brancher|creer|preparer|peindre|carreler|isoler|traiter|reparer|desembouer)\b/;

/** Mots sans valeur pour la recherche (consigne, articles, verbes de demande). */
const STOP_WORDS = new Set(
  (
    "fiche fiches technique techniques pratique chantier mode operatoire procedure tuto tutoriel pas etape etapes " +
    "comment quelle quelles quels quel sont les la le les un une des du de d l au aux en et ou pour sur dans avec " +
    "je j tu on il nous vous me moi m te ta ton mon ma mes montre montrer donne donner affiche afficher ouvre ouvrir " +
    "trouve trouver cherche chercher as tu est ce que qu peux peut faut fait faire realiser bien correctement svp stp " +
    "merci soline assistant bonjour salut"
  ).split(" "),
);

function foldMessage(message: string): string {
  return foldSearchText(message).replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ");
}

/** Le message parle de l'app (devis, factures, clients, RDV…) plutôt que du chantier. */
const APP_TOPIC = /\b(devis|facture|chiffr|abonnement|client|rdv|rendez|agenda|inviter|invitation|compte|mot de passe|appli|application|soline|reglage|parametre)/;

/** Demande explicite de fiche ou de méthode : l'assistant répond toujours (fiche ou « pas de fiche »). */
export function looksLikeTechnicalSheetRequest(message: string): boolean {
  const m = foldMessage(message);
  if (/\b(devis|facture|chiffr)/.test(m)) return false;
  return SHEET_WORD.test(m) || HOW_TO.test(m);
}

const PROBLEM_QUESTION =
  /\b((je|on) (fais|fait|dois faire) quoi|que (dois je |faut il )?faire|qu est ce (que|qu) (je|on) (fais|fait|doit)|comment (je|on) (fais|fait|m y prends|s y prend|proc[e]de)|comment (reparer|regler|traiter|resoudre|eviter|proceder))\b/;
const PROBLEM_WORDS =
  /\b(fuite|fuit|panne|probleme|souci|saute|disjoncte|ne marche|ne fonctionne|humidite|moisissure|fissure|cloque|decolle|sonne creux|bouche|odeur|condensation|rouille|calcaire|froid|bruit)\b/;

/**
 * Situation de chantier décrite sans demander de fiche (« j'ai une fuite à côté du tableau,
 * je fais quoi ? »). Signal faible : l'assistant ne répond que si une fiche correspond.
 */
export function looksLikeWorksiteSituation(message: string): boolean {
  const m = foldMessage(message);
  if (APP_TOPIC.test(m)) return false;
  return PROBLEM_QUESTION.test(m) || (PROBLEM_WORDS.test(m) && /\?\s*$/.test(message.trim()));
}

/** Racine courte : « raccorder » trouve « raccordement », « poser » trouve « pose ». */
function stem(term: string): string {
  if (term.length > 6) return term.slice(0, 6);
  if (term.length > 4 && /(er|ez|es|e|s)$/.test(term)) return term.replace(/(er|ez|es|e|s)$/, "");
  return term;
}

export function sheetQueryTerms(message: string): string[] {
  return foldSearchText(message)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term))
    .map(stem);
}

/** Sujet de la demande, pour préremplir la recherche de la page Fiches. */
export function sheetQueryTopic(message: string): string {
  return foldSearchText(message)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term))
    .join(" ")
    .slice(0, 120);
}

/**
 * Fiches les plus proches de la demande : au moins 60 % des mots retrouvés,
 * classées par pertinence puis métier de l'artisan en premier.
 */
export function findSheetsForQuestion(
  message: string,
  options: {
    tradeCategoryId?: string | null;
    tradeId?: string | null;
    /** Fiches retirées de l'app (à corriger). */
    excludedIds?: ReadonlySet<string>;
    limit?: number;
  } = {},
): LibraryTechnicalSheet[] {
  const terms = [...new Set(sheetQueryTerms(message))];
  if (terms.length === 0) return [];
  const needed = Math.max(1, Math.ceil(terms.length * 0.6));

  return TECHNICAL_SHEET_LIBRARY.filter((sheet) => !options.excludedIds?.has(sheet.id))
    .map((sheet) => {
      const title = foldSearchText(sheet.title);
      const haystack = foldSearchText(`${sheet.title} ${sheet.summary} ${sheet.keywords.join(" ")}`);
      const hits = terms.filter((term) => haystack.includes(term)).length;
      const titleHits = terms.filter((term) => title.includes(term)).length;
      const mine = sheetMatchesTrade(sheet, options.tradeCategoryId, options.tradeId);
      return { sheet, hits, score: hits * 10 + titleHits * 3 + (mine ? 1 : 0) };
    })
    .filter((row) => row.hits >= needed)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 3)
    .map((row) => row.sheet);
}
