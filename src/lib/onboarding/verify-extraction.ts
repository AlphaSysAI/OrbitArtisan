import { isConsistentFrenchVat, isValidSiret, onlyDigits } from "@/lib/onboarding/identifiers";
import type { ExtractedTextField, QuoteExtraction } from "@/lib/onboarding/quote-import-schema";

/**
 * Garde-fou anti-hallucination, 100 % déterministe (aucun appel IA).
 * Une valeur légale n'est retenue que si :
 *  1. le modèle l'a marquée « high » et a fourni une preuve textuelle,
 *  2. cette preuve existe réellement dans le texte OCR du document,
 *  3. la valeur est contenue dans la preuve,
 *  4. elle passe le contrôle de format (Luhn SIRET, clé TVA, code postal…).
 * Sinon : null + raison, et l'UI demande CE champ-là à l'artisan.
 */

export const LEGAL_KEYS = [
  "business_name",
  "siret",
  "vat_number",
  "trade_register",
  "address_line1",
  "postal_code",
  "city",
  "phone",
  "email",
  "decennale_insurer",
  "decennale_policy_number",
  "decennale_coverage_area",
  "rc_pro_insurer",
  "rc_pro_number",
  "mediator_name",
  "mediator_url",
  "payment_terms_days",
] as const;
export type LegalKey = (typeof LEGAL_KEYS)[number];

export type FieldStatus = "verified" | "missing" | "unreadable" | "invalid" | "conflict";

export type VerifiedField = {
  value: string | null;
  status: FieldStatus;
  /** Valeurs vues dans plusieurs devis qui ne concordent pas (statut conflict). */
  options?: string[];
};

export type CatalogCandidate = {
  key: string;
  label: string;
  unit: string | null;
  unitPriceCents: number | null;
  vatRate: 5.5 | 10 | 20 | null;
  occurrences: number;
  /** Présélectionnée à l'import : prix vérifié dans le texte. */
  selected: boolean;
};

export type VerifiedDocument = {
  readable: boolean;
  legal: Record<LegalKey, VerifiedField>;
  vatFranchise: boolean;
  lines: CatalogCandidate[];
};

function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[​-‍﻿]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/[‐‑–—]/g, "-")
    .replace(/[|*#_>]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

type Kind = "text" | "digits" | "alnum" | "number";

function evidenceHolds(field: { value: unknown; evidence: string | null }, source: string, kind: Kind): boolean {
  const evidence = field.evidence?.trim();
  if (!evidence || evidence.length > 400) return false;
  const src = normalizeForMatch(source);
  const ev = normalizeForMatch(evidence);
  if (ev.length < 2 || !src.includes(ev)) return false;
  const v = String(field.value ?? "");
  switch (kind) {
    case "digits":
      return onlyDigits(v).length > 0 && onlyDigits(evidence).includes(onlyDigits(v));
    case "alnum": {
      const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
      return clean(v).length > 0 && clean(evidence).includes(clean(v));
    }
    case "number":
      return onlyDigits(evidence).includes(String(Math.round(Number(v))));
    default:
      return normalizeForMatch(v).length > 0 && ev.includes(normalizeForMatch(v));
  }
}

function verify(
  field: ExtractedTextField | { value: number | null; evidence: string | null; confidence: "high" | "low" },
  source: string,
  kind: Kind,
  normalize: (v: string) => string | null = (v) => v.trim().replace(/\s+/g, " ") || null,
): VerifiedField {
  if (field.value === null || field.value === "") return { value: null, status: "missing" };
  if (field.confidence !== "high" || !evidenceHolds(field, source, kind)) return { value: null, status: "unreadable" };
  const value = normalize(String(field.value));
  return value ? { value, status: "verified" } : { value: null, status: "invalid" };
}

function normalizePhoneFr(v: string): string | null {
  const d = onlyDigits(v);
  if (/^0[1-9]\d{8}$/.test(d)) return d;
  if (/^33[1-9]\d{8}$/.test(d)) return `0${d.slice(2)}`;
  return null;
}

function parseUnitPriceCents(line: QuoteExtraction["lines"][number], source: string): { cents: number | null; checked: boolean } {
  const p = line.unit_price_ht;
  if (p === null || !Number.isFinite(p) || p <= 0 || p >= 100_000) return { cents: null, checked: false };
  const cents = Math.round(p * 100);
  const ev = line.evidence ?? "";
  const inSource = ev.length > 3 && normalizeForMatch(source).includes(normalizeForMatch(ev));
  const digits = onlyDigits(ev);
  const shown = Number.isInteger(p) ? [String(p), String(cents)] : [String(cents)];
  return { cents, checked: inSource && shown.some((s) => digits.includes(s)) };
}

export function verifyExtraction(ext: QuoteExtraction, source: string): VerifiedDocument {
  const c = ext.company;
  const ins = ext.insurance;
  const siret = verify(c.siret, source, "digits", (v) => (isValidSiret(v) ? onlyDigits(v) : null));
  const vat = verify(c.vat_number, source, "alnum", (v) => {
    const n = v.replace(/\s/g, "").toUpperCase();
    if (!/^FR[0-9A-Z]{2}\d{9}$/.test(n)) return null;
    // Clé TVA incohérente avec le SIRET lu : on ne garde ni l'un ni l'autre sans l'artisan.
    if (siret.value && !isConsistentFrenchVat(n, siret.value.slice(0, 9))) return null;
    return n;
  });

  const legal: Record<LegalKey, VerifiedField> = {
    business_name: verify(c.business_name, source, "text"),
    siret,
    vat_number: vat,
    trade_register: verify(c.trade_register, source, "alnum"),
    address_line1: verify(c.address_line1, source, "text"),
    postal_code: verify(c.postal_code, source, "digits", (v) => (/^\d{5}$/.test(onlyDigits(v)) ? onlyDigits(v) : null)),
    city: verify(c.city, source, "text"),
    phone: verify(c.phone, source, "digits", normalizePhoneFr),
    email: verify(c.email, source, "text", (v) => (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v.trim()) ? v.trim().toLowerCase() : null)),
    decennale_insurer: verify(ins.decennale_insurer, source, "text"),
    decennale_policy_number: verify(ins.decennale_policy_number, source, "alnum"),
    decennale_coverage_area: verify(ins.decennale_coverage_area, source, "text"),
    rc_pro_insurer: verify(ins.rc_pro_insurer, source, "text"),
    rc_pro_number: verify(ins.rc_pro_number, source, "alnum"),
    mediator_name: verify(ext.mediator.name, source, "text"),
    mediator_url: verify(ext.mediator.url, source, "text", (v) => {
      const t = v.trim();
      const url = /^https?:\/\//i.test(t) ? t : /^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(t) ? `https://${t}` : null;
      return url;
    }),
    payment_terms_days: verify(ext.payment_terms_days, source, "number", (v) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) && n >= 0 && n <= 120 ? String(n) : null;
    }),
  };

  const franchise = verify(c.vat_franchise_mention, source, "text");
  const vatFranchise = franchise.status === "verified" && /293\s*b/i.test(franchise.value ?? "");

  const lines: CatalogCandidate[] = [];
  for (const l of ext.lines) {
    const label = l.label.trim().replace(/\s+/g, " ");
    if (label.length < 3 || label.length > 200) continue;
    const price = parseUnitPriceCents(l, source);
    lines.push({
      key: `${normalizeForMatch(label)}|${l.unit ?? ""}`,
      label,
      unit: l.unit,
      unitPriceCents: price.cents,
      vatRate: vatFranchise ? null : l.vat_rate,
      occurrences: 1,
      selected: l.confidence === "high" && price.checked,
    });
  }

  return { readable: ext.readable && ext.document_kind !== "other", legal, vatFranchise, lines };
}

type InferredVatRegime = { value: "normal" | "franchise" | null; reason: "document" | "conflict" | "unknown" };

/**
 * Régime de TVA constaté sur les devis. Mention 293 B vérifiée → franchise ;
 * n° de TVA vérifié ou taux de TVA sur les lignes → normal ; les deux → conflit
 * (changement de régime entre deux devis) ; rien → inconnu. Jamais deviné depuis la forme juridique.
 */
export function inferVatRegime(merged: Pick<ReturnType<typeof mergeVerifiedDocuments>, "legal" | "lines" | "vatFranchise">): InferredVatRegime {
  const normal = merged.legal.vat_number.status === "verified" || merged.lines.some((l) => l.vatRate !== null && l.vatRate > 0);
  if (merged.vatFranchise && normal) return { value: null, reason: "conflict" };
  if (merged.vatFranchise) return { value: "franchise", reason: "document" };
  if (normal) return { value: "normal", reason: "document" };
  return { value: null, reason: "unknown" };
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

function sameValue(a: string, b: string): boolean {
  return normalizeForMatch(a).replace(/[^a-z0-9]/g, "") === normalizeForMatch(b).replace(/[^a-z0-9]/g, "");
}

/** Fusion de 2-3 devis : concordance exigée sur les champs légaux, catalogue dédoublonné. */
export function mergeVerifiedDocuments(docs: VerifiedDocument[]): Omit<VerifiedDocument, "readable"> & { readableCount: number } {
  const readable = docs.filter((d) => d.readable);
  const legal = {} as Record<LegalKey, VerifiedField>;
  for (const key of LEGAL_KEYS) {
    const verified = readable.map((d) => d.legal[key]).filter((f) => f.status === "verified" && f.value) as { value: string }[];
    const distinct: string[] = [];
    for (const f of verified) if (!distinct.some((d) => sameValue(d, f.value))) distinct.push(f.value);
    if (distinct.length === 1) legal[key] = { value: distinct[0]!, status: "verified" };
    else if (distinct.length > 1) legal[key] = { value: null, status: "conflict", options: distinct.slice(0, 3) };
    else {
      const seen = readable.some((d) => d.legal[key].status === "unreadable" || d.legal[key].status === "invalid");
      legal[key] = { value: null, status: seen ? "unreadable" : "missing" };
    }
  }

  const byKey = new Map<string, { base: CatalogCandidate; prices: number[]; vats: number[]; selected: boolean; n: number }>();
  for (const line of readable.flatMap((d) => d.lines)) {
    const g = byKey.get(line.key) ?? { base: line, prices: [], vats: [], selected: false, n: 0 };
    if (line.unitPriceCents) g.prices.push(line.unitPriceCents);
    if (line.vatRate) g.vats.push(line.vatRate);
    g.selected = g.selected || line.selected;
    g.n += 1;
    byKey.set(line.key, g);
  }
  const lines: CatalogCandidate[] = [...byKey.values()]
    .map((g) => {
      const vatCounts = new Map<number, number>();
      for (const v of g.vats) vatCounts.set(v, (vatCounts.get(v) ?? 0) + 1);
      const vat = [...vatCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as 5.5 | 10 | 20 | undefined;
      return {
        ...g.base,
        unitPriceCents: g.prices.length ? median(g.prices) : null,
        vatRate: vat ?? null,
        occurrences: g.n,
        selected: g.selected && g.prices.length > 0,
      };
    })
    .sort((a, b) => b.occurrences - a.occurrences || a.label.localeCompare(b.label))
    .slice(0, 60);

  return {
    legal,
    vatFranchise: readable.some((d) => d.vatFranchise),
    lines,
    readableCount: readable.length,
  };
}
