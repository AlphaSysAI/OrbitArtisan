import { findTradeCategory, formatTradeLabel } from "@/lib/trades/taxonomy";

/**
 * Récapitulatif ANONYMISÉ d'un chantier, montrable à un artisan non inscrit :
 * métier, commune (jamais la rue), budget, besoin reformulé expurgé de toute
 * coordonnée. Le nom, le téléphone et l'e-mail du particulier ne sortent jamais.
 */
export type AnonymizedLeadSummary = {
  trade: string;
  commune: string | null;
  budget: { min: number; max: number } | null;
  need: string | null;
};

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const PHONE_RE = /(?:\+33|0033|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g;
const STREET_RE = /\b\d{1,4}\s*(?:bis|ter)?\s*,?\s*(?:rue|avenue|av\.?|boulevard|bd|chemin|impasse|allée|allee|place|route|quai|lotissement|lieu[- ]dit)\b[^,.;\n]*/gi;

export function scrubPii(text: string): string {
  return text
    .replace(EMAIL_RE, "[e-mail masqué]")
    .replace(PHONE_RE, "[téléphone masqué]")
    .replace(STREET_RE, "[adresse masquée]")
    .replace(/\s+/g, " ")
    .trim();
}

/** « 12 rue des Lilas 11000 Carcassonne » → « 11000 Carcassonne ». */
export function communeFromAddress(label: string | null | undefined): string | null {
  const m = label?.match(/\b(\d{5})\s+([^\d,]+?)\s*$/);
  return m ? `${m[1]} ${m[2]!.trim()}` : null;
}

export function buildAnonymizedSummary(lead: {
  trade: string | null;
  trade_category: string | null;
  address_label: string | null;
  estimate_min: number | null;
  estimate_max: number | null;
  need_summary: string | null;
}): AnonymizedLeadSummary {
  const trade =
    formatTradeLabel(lead.trade_category, lead.trade)?.split(" · ").pop() ??
    findTradeCategory(lead.trade_category)?.label ??
    "Travaux";
  const need = lead.need_summary ? scrubPii(lead.need_summary).slice(0, 280) : null;
  return {
    trade,
    commune: communeFromAddress(lead.address_label),
    budget: lead.estimate_min != null && lead.estimate_max != null ? { min: lead.estimate_min, max: lead.estimate_max } : null,
    need: need || null,
  };
}

export function formatBudget(b: AnonymizedLeadSummary["budget"]): string {
  if (!b) return "budget non estimé";
  const f = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
  return `${f(b.min)} – ${f(b.max)}`;
}
