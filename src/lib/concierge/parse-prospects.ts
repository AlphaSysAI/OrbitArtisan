import { isNonArtisanLabel, resolveProspectTrade } from "@/lib/concierge/trade-mapping";
import { normalizeCustomerPhone } from "@/lib/phone";

/**
 * Parse un export d'annuaire (CSV ou JSON) en prospects prêts à insérer.
 * Minimisation : SEULES les colonnes utiles au matching local sont lues ;
 * tout le reste (e-mail, site, avis, dirigeant, horaires…) est ignoré et jamais stocké.
 */

export type ProspectInput = {
  business_name: string;
  trade: string;
  trade_category: string;
  phone: string;
  city: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  /** E-mail pro vérifié (repli des lignes fixes), sinon null. */
  email: string | null;
};

export type ParseReport = {
  rows: ProspectInput[];
  rejected: {
    line: number;
    reason: "missing_name" | "invalid_phone" | "unknown_trade" | "not_artisan" | "closed" | "duplicate_in_file";
  }[];
  total: number;
};

const COLUMNS: Record<keyof Omit<ProspectInput, "trade_category" | "email"> | "trade", string[]> = {
  business_name: ["business_name", "name", "nom", "raison_sociale", "title", "entreprise", "nom_entreprise"],
  // Ordre = priorité : le « type » principal Google (Outscraper, anglais normalisé) est
  // plus fiable que la catégorie française, souvent vide.
  trade: ["trade", "metier", "métier", "type", "category", "categorie", "catégorie", "categoryname", "activite", "activité"],
  phone: ["phone", "telephone", "téléphone", "tel", "phone_number", "phonenumber", "numero", "mobile"],
  city: ["city", "ville", "commune", "locality"],
  postal_code: ["postal_code", "postcode", "code_postal", "cp", "zip", "zipcode"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lng", "lon", "long"],
};

function key(h: string) {
  return h.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s.-]+/g, "_").trim();
}

function resolveColumns(headers: string[]) {
  const map: Partial<Record<keyof typeof COLUMNS, string>> = {};
  for (const [field, aliases] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, string[]][]) {
    // Priorité à l'ordre des alias (pas à l'ordre des colonnes du fichier).
    const byKey = new Map(headers.map((h) => [key(h), h]));
    const found = aliases.map(key).find((a) => byKey.has(a));
    if (found) map[field] = byKey.get(found);
  }
  return map;
}

/** CSV RFC 4180 (guillemets, séparateur « , » ou « ; » détecté sur l'en-tête). */
function parseCsv(text: string): Record<string, string>[] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.indexOf("\n") === -1 ? undefined : src.indexOf("\n"));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) records.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) records.push(row);
  const [headers, ...data] = records;
  if (!headers) return [];
  return data.map((r) => Object.fromEntries(headers.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null;
}

export function parseProspectFile(content: string, format: "csv" | "json", maxRows = 5000): ParseReport {
  let records: Record<string, unknown>[];
  if (format === "json") {
    const parsed: unknown = JSON.parse(content);
    const arr = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { data?: unknown })?.data) ? (parsed as { data: unknown[] }).data : [];
    records = arr.filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null);
  } else {
    records = parseCsv(content);
  }
  return parseProspectRecords(records, maxRows);
}

/** Colonnes annexes lues pour qualifier la fiche (jamais stockées). */
const EXTRA = {
  subtypes: ["subtypes", "sous_types"],
  category: ["category", "categorie", "catégorie"],
  query: ["query", "recherche"],
  status: ["business_status", "statut"],
  email: ["email", "e_mail", "courriel", "mail"],
  emailStatus: ["email_emails_validator_status", "email_status"],
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * E-mail retenu seulement s'il est unique et, quand l'extracteur fournit une
 * vérification (Outscraper), jugé « RECEIVING » (boîte existante et joignable).
 */
function pickEmail(raw: string, status: string | null): string | null {
  const email = raw.trim().toLowerCase();
  if (!email || /[,;\s]/.test(email) || email.length > 254 || !EMAIL_RE.test(email)) return null;
  if (status !== null && status.trim().toUpperCase() !== "RECEIVING") return null;
  return email;
}

function findColumn(headers: string[], aliases: string[]): string | undefined {
  const byKey = new Map(headers.map((h) => [key(h), h]));
  const found = aliases.map(key).find((a) => byKey.has(a));
  return found ? byKey.get(found) : undefined;
}

export function parseProspectRecords(input: Record<string, unknown>[], maxRows = 5000): ParseReport {
  const records = input.slice(0, maxRows);
  const headers = records[0] ? Object.keys(records[0]) : [];
  const cols = resolveColumns(headers);
  const get = (r: Record<string, unknown>, f: keyof typeof COLUMNS) => (cols[f] ? r[cols[f]!] : undefined);
  const extra = Object.fromEntries(Object.entries(EXTRA).map(([k, a]) => [k, findColumn(headers, a)])) as Record<keyof typeof EXTRA, string | undefined>;
  const str = (r: Record<string, unknown>, col: string | undefined) => (col ? String(r[col] ?? "").trim() : "");

  const rows: ProspectInput[] = [];
  const rejected: ParseReport["rejected"] = [];
  const seen = new Set<string>();

  records.forEach((r, i) => {
    const line = i + 2; // ligne 1 = en-tête
    const name = String(get(r, "business_name") ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
    if (name.length < 2) return void rejected.push({ line, reason: "missing_name" });
    const phone = normalizeCustomerPhone(String(get(r, "phone") ?? ""));
    if (!phone) return void rejected.push({ line, reason: "invalid_phone" });
    if (/^closed/i.test(str(r, extra.status))) return void rejected.push({ line, reason: "closed" });
    const primary = String(get(r, "trade") ?? "");
    // Type principal « commerce / fabricant » : seuls les sous-types peuvent requalifier
    // la fiche (jamais la recherche d'origine, qui ramène aussi les magasins).
    const subtypes = str(r, extra.subtypes).split(",");
    const others = isNonArtisanLabel(primary)
      ? subtypes
      : [...subtypes, extra.category !== cols.trade ? str(r, extra.category) : "", str(r, extra.query).split(",")[0] ?? ""];
    const trade = resolveProspectTrade(primary, others);
    if (trade === "not_artisan") return void rejected.push({ line, reason: "not_artisan" });
    if (!trade) return void rejected.push({ line, reason: "unknown_trade" });
    if (seen.has(phone)) return void rejected.push({ line, reason: "duplicate_in_file" });
    seen.add(phone);

    const cp = String(get(r, "postal_code") ?? "").replace(/\s/g, "");
    const lat = num(get(r, "latitude"));
    const lng = num(get(r, "longitude"));
    const coordsOk = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
    rows.push({
      business_name: name,
      trade: trade.trade,
      trade_category: trade.category,
      phone,
      city: String(get(r, "city") ?? "").trim().slice(0, 120) || null,
      postal_code: /^\d{5}$/.test(cp) ? cp : null,
      latitude: coordsOk ? lat : null,
      longitude: coordsOk ? lng : null,
      email: pickEmail(str(r, extra.email), extra.emailStatus ? str(r, extra.emailStatus) : null),
    });
  });

  return { rows, rejected, total: records.length };
}
