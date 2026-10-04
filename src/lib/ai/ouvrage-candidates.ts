import { roundMaterialQuantity } from "@/lib/quotes/material-quantity";
import { normalizeWorkUnit } from "@/lib/work-library/csv";
import type { PlatformWorkItem } from "@/lib/work-library/platform-catalog-types";

/**
 * Ouvrages « fourni posé » proposables au devis IA, dans l'ordre de priorité :
 * 1. bibliothèque de l'artisan (ses prix) ; 2. catalogue Soline borné à son métier (prix indicatifs).
 * Le modèle ne fait que CHOISIR une clé et une quantité : prix, unité et TVA viennent toujours d'ici.
 */
export type OuvrageSource = "library" | "soline";

export type OuvrageCandidate = {
  /** Clé courte donnée au modèle (B1… bibliothèque, S1… Soline). */
  key: string;
  source: OuvrageSource;
  reference: string | null;
  title: string;
  description: string;
  unit: string;
  unitPriceHt: number;
  vatRate: number;
};

export type LibraryWorkItemRow = {
  reference: string | null;
  title: string;
  description: string | null;
  unit: string;
  unit_price_ht: number | string;
  default_vat_rate: number | string;
};

export type ResolvedOuvrageLine = {
  source: OuvrageSource;
  reference: string | null;
  title: string;
  description: string;
  unit: string;
  /** Entier pour U / forfait, 2 décimales pour m², ml, m³, h… */
  quantity: number;
  /** Quantité demandée avant arrondi, pour l'avertissement. */
  requestedQuantity: number;
  unitPriceEur: number;
  vatRate: number;
};

const STOP = new Set([
  "pour", "avec", "sans", "sous", "dans", "type", "fourni", "fournie", "pose", "posee", "mise", "oeuvre",
  "compris", "comprise", "hors", "existant", "existante", "neuf", "neuve", "standard", "travaux", "devis",
  "client", "chez", "faire", "refaire", "veut", "voudrait", "besoin", "environ", "metre", "metres",
]);

export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/gi, "oe")
    .replace(/(\d)\s*[×x*]\s*(\d)/gi, "$1x$2")
    .toLowerCase();
}

/** Mots significatifs (≥ 4 lettres, pluriel simple retiré) et cotes du type « 60x60 », « 20 ». */
export function significantWords(text: string): string[] {
  return foldText(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => (w.length >= 4 || /^\d+x\d+$/.test(w)) && !STOP.has(w))
    .map((w) => (w.length > 4 ? w.replace(/(s|x)$/, "") : w));
}

const MAX_PER_SOURCE = 25;

function score(instructionWords: Set<string>, candidateTitle: string): number {
  const words = [...new Set(significantWords(candidateTitle))];
  if (words.length === 0) return 0;
  const hits = words.filter((w) => instructionWords.has(w)).length;
  return hits === 0 ? 0 : hits / words.length + hits * 0.05;
}

/** Bibliothèque + catalogue (déjà filtré sur le métier) → présélection pertinente pour l'instruction. */
export function shortlistOuvrages(
  instruction: string,
  library: LibraryWorkItemRow[],
  soline: PlatformWorkItem[],
): OuvrageCandidate[] {
  const words = new Set(significantWords(instruction));
  const pick = <T>(rows: T[], title: (r: T) => string) =>
    rows
      .map((row) => ({ row, s: score(words, title(row)) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, MAX_PER_SOURCE)
      .map((x) => x.row);

  const fromLibrary = pick(
    library.filter((r) => Number(r.unit_price_ht) > 0),
    (r) => r.title,
  ).map<OuvrageCandidate>((r, i) => ({
    key: `B${i + 1}`,
    source: "library",
    reference: r.reference?.trim() || null,
    title: r.title,
    description: r.description ?? "",
    unit: r.unit,
    unitPriceHt: Number(r.unit_price_ht),
    vatRate: Number(r.default_vat_rate) || 20,
  }));

  // Un ouvrage Soline déjà importé (même référence) n'est proposé qu'une fois, au prix de l'artisan.
  const libraryRefs = new Set(library.map((r) => r.reference?.trim().toLowerCase()).filter(Boolean));
  const fromSoline = pick(
    soline.filter((s) => !libraryRefs.has(s.reference.toLowerCase())),
    (s) => s.title,
  ).map<OuvrageCandidate>((s, i) => ({
    key: `S${i + 1}`,
    source: "soline",
    reference: s.reference,
    title: s.title,
    description: s.description,
    unit: s.unit,
    unitPriceHt: s.unitPriceHt,
    vatRate: s.defaultVatRate,
  }));

  return [...fromLibrary, ...fromSoline];
}

export function formatOuvragesForPrompt(candidates: OuvrageCandidate[]): string {
  if (candidates.length === 0) return "";
  const line = (c: OuvrageCandidate) => `- ${c.key} · ${c.title} · par ${c.unit}`;
  const lib = candidates.filter((c) => c.source === "library");
  const sol = candidates.filter((c) => c.source === "soline");
  return [
    "Ouvrages chiffrés disponibles (prix fourni posé déjà connus, ne les recalcule pas) :",
    lib.length ? `Bibliothèque de l'artisan (prioritaire) :\n${lib.map(line).join("\n")}` : "",
    sol.length ? `Catalogue Soline (si rien d'équivalent dans la bibliothèque) :\n${sol.map(line).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Lignes choisies par le modèle → lignes chiffrées. Clé inconnue, quantité invalide ou doublon : ignorés.
 * `blockedTitles` : postes déjà chiffrés par le métré déterministe (pas de double comptage).
 */
export function resolveOuvrageLines(
  picks: { key: string; quantity: number }[],
  candidates: OuvrageCandidate[],
  blockedTitles: string[] = [],
): ResolvedOuvrageLine[] {
  const byKey = new Map(candidates.map((c) => [c.key.toUpperCase(), c]));
  const blocked = blockedTitles.map((t) => new Set(significantWords(t)));
  const seen = new Set<string>();
  const out: ResolvedOuvrageLine[] = [];
  for (const pick of picks) {
    const c = byKey.get(String(pick.key ?? "").trim().toUpperCase());
    const qty = Number(pick.quantity);
    if (!c || !Number.isFinite(qty) || qty <= 0 || seen.has(c.key)) continue;
    const words = significantWords(c.title);
    // Prudence : un seul mot significatif commun avec un poste du métré suffit à écarter la ligne.
    if (blocked.some((b) => words.some((w) => b.has(w)))) continue;
    seen.add(c.key);
    out.push({
      source: c.source,
      reference: c.reference,
      title: c.title,
      description: c.description,
      unit: c.unit,
      quantity: roundMaterialQuantity(qty, c.unit),
      requestedQuantity: qty,
      unitPriceEur: c.unitPriceHt,
      vatRate: c.vatRate,
    });
  }
  return out;
}

const LABEL_MIN_OVERLAP = 0.6;

/**
 * Libellé de ligne → ouvrage du catalogue, sans modèle : même unité et recouvrement des mots
 * significatifs ≥ 60 % dans les deux sens. Égalité entre deux ouvrages = ambigu → null.
 */
export function matchOuvrageByLabel(
  label: string,
  unit: string | null | undefined,
  items: PlatformWorkItem[],
): PlatformWorkItem | null {
  const wantedUnit = unit ? normalizeWorkUnit(unit) : null;
  const wanted = new Set(significantWords(label));
  if (!wantedUnit || wanted.size === 0) return null;
  let best: { item: PlatformWorkItem; score: number } | null = null;
  let tie = false;
  for (const item of items) {
    if (normalizeWorkUnit(item.unit) !== wantedUnit) continue;
    const words = new Set(significantWords(item.title));
    if (words.size === 0) continue;
    const common = [...wanted].filter((w) => words.has(w)).length;
    const a = common / wanted.size;
    const b = common / words.size;
    if (a < LABEL_MIN_OVERLAP || b < LABEL_MIN_OVERLAP) continue;
    const score = a + b;
    if (!best || score > best.score + 1e-9) {
      best = { item, score };
      tie = false;
    } else if (Math.abs(score - best.score) <= 1e-9) {
      tie = true;
    }
  }
  return best && !tie ? best.item : null;
}

/**
 * TVA de la ligne au devis : elle suit le taux du devis (contexte réel du chantier : neuf,
 * rénovation…), sauf un ouvrage de rénovation énergétique à 5,5 % qui garde son taux propre
 * (signalé à l'artisan). Franchise en base (devis à 0 %) : toujours le taux du devis.
 * "" = suit le taux du devis.
 */
export function ouvrageLineVatRate(ouvrageVat: number, quoteVat: number | string): string {
  const quote = Number(String(quoteVat).replace(",", "."));
  return ouvrageVat === 5.5 && quote !== 0 ? "5.5" : "";
}
