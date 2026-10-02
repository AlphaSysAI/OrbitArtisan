import { listWorkRecipes } from "@/lib/ai/work-recipes";

/**
 * Barème de prix HT d'achat de la bibliothèque d'ouvrages (`reference_price_ht_eur`),
 * consulté AVANT toute recherche web. Une correspondance exige le même article (libellé
 * identique ou quasi identique) ET la même unité : un prix au sac n'est jamais appliqué
 * à des kg, ni un prix au m² à des unités.
 */

type ReferenceEntry = { name: string; tokens: Set<string>; unit: string; priceHtEur: number };

const STOP = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "a", "au", "aux", "en", "et", "ou", "pour", "avec", "sur", "type"]);

function fold(text: string): string {
  return text.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function tokens(name: string): Set<string> {
  return new Set(
    fold(name)
      .split(/[^a-z0-9]+/)
      .filter((t) => t && !STOP.has(t))
      .map((t) => (t.length > 3 ? t.replace(/s$/, "") : t)),
  );
}

/** m², m2 → m2 ; sac, sacs → sac ; unité, u, pièce → u … */
export function normalizeUnit(unit: string | null | undefined): string | null {
  const u = fold(unit ?? "").trim().replace(/\.$/, "");
  if (!u) return null;
  if (/^(u|un|unite|unites|piece|pieces|pce|pcs)$/.test(u)) return "u";
  if (/^m(2|²)$/.test(u)) return "m2";
  if (/^m(3|³)$/.test(u)) return "m3";
  if (/^(ml|m lineaire|metre lineaire|metres lineaires)$/.test(u)) return "ml";
  return u.replace(/s$/, "");
}

let index: ReferenceEntry[] | null = null;

function referenceIndex(): ReferenceEntry[] {
  if (index) return index;
  const seen = new Set<string>();
  index = [];
  for (const recipe of listWorkRecipes()) {
    for (const m of recipe.materials_per_unit) {
      const unit = normalizeUnit(m.unit);
      if (!m.reference_price_ht_eur || !unit) continue;
      const key = `${fold(m.name_generic)}|${unit}`;
      if (seen.has(key)) continue;
      seen.add(key);
      index.push({ name: m.name_generic, tokens: tokens(m.name_generic), unit, priceHtEur: m.reference_price_ht_eur });
    }
  }
  return index;
}

/** Similarité de libellés : part des mots communs rapportée au libellé le plus long. */
function overlap(a: Set<string>, b: Set<string>): number {
  let common = 0;
  for (const t of a) if (b.has(t)) common += 1;
  return common / Math.max(a.size, b.size, 1);
}

const MIN_OVERLAP = 0.75;

/** Prix HT d'achat de référence pour une fourniture, ou null (→ recherche web). */
export function findReferencePrice(
  name: string,
  unit: string | null | undefined,
): { priceHtEur: number; referenceName: string } | null {
  const wantedUnit = normalizeUnit(unit);
  if (!wantedUnit || !name.trim()) return null;
  const wanted = tokens(name);
  let best: { entry: ReferenceEntry; score: number } | null = null;
  for (const entry of referenceIndex()) {
    if (entry.unit !== wantedUnit) continue;
    const score = overlap(wanted, entry.tokens);
    if (score >= MIN_OVERLAP && (!best || score > best.score)) best = { entry, score };
  }
  return best ? { priceHtEur: best.entry.priceHtEur, referenceName: best.entry.name } : null;
}
