import type { WorkItemCsvRow } from "@/lib/work-library/types";
import { isVatRate, isWorkUnit } from "@/lib/work-library/units";

/**
 * Import / export de la bibliothèque d'ouvrages.
 *
 * Sources acceptées : CSV (`;`, `,` ou tabulation, UTF-8 ou Windows-1252 — export
 * Excel FR par défaut) et XLSX (matrice lue côté serveur par `readXlsxMatrix`).
 * Les en-têtes sont reconnus sans tenir compte de la casse ni des accents
 * (« Désignation », « PU HT », « Unité »…) et peuvent être précédés de lignes de
 * titre. Sans en-tête reconnu : ordre des colonnes de l'export Soline.
 */

export const MAX_IMPORT_ROWS = 2000;

type Field = keyof WorkItemCsvRow;

/** Ordre de l'export Soline, utilisé aussi en repli positionnel (fichier sans en-tête). */
const FIELD_ORDER: Field[] = [
  "reference",
  "title",
  "description",
  "category",
  "unit",
  "unit_price_ht",
  "default_vat_rate",
  "labor_cost",
  "material_cost",
  "estimated_hours",
];

const EXPORT_HEADERS: Record<Field, string> = {
  reference: "Référence",
  title: "Désignation",
  description: "Description",
  category: "Catégorie",
  unit: "Unité",
  unit_price_ht: "Prix unitaire HT",
  default_vat_rate: "TVA",
  labor_cost: "Coût main-d'œuvre",
  material_cost: "Coût fournitures",
  estimated_hours: "Heures estimées",
};

/** Alias d'en-têtes, sous forme normalisée (minuscules, sans accents ni ponctuation). */
const HEADER_ALIASES: Record<Field, string[]> = {
  reference: ["reference", "ref", "code", "code article", "article", "n", "no", "numero"],
  title: ["title", "titre", "designation", "libelle", "intitule", "ouvrage", "prestation", "nom", "produit"],
  description: ["description", "detail", "details", "descriptif", "commentaire", "observations"],
  category: ["category", "categorie", "famille", "lot", "rubrique", "chapitre", "corps d etat"],
  unit: ["unit", "unite", "u", "unite de mesure", "um"],
  unit_price_ht: [
    "unit price ht",
    "prix ht",
    "prix unitaire ht",
    "prix unitaire",
    "pu ht",
    "pu",
    "prix",
    "tarif",
    "tarif ht",
    "prix de vente ht",
    "pv ht",
  ],
  default_vat_rate: ["default vat rate", "tva", "taux tva", "taux de tva", "tva %", "vat"],
  labor_cost: ["labor cost", "mo", "main d oeuvre", "cout main d oeuvre", "cout mo", "debourse mo"],
  material_cost: [
    "material cost",
    "fourniture",
    "fournitures",
    "cout fournitures",
    "materiaux",
    "cout materiaux",
    "debourse fourniture",
  ],
  estimated_hours: ["estimated hours", "heures", "heures estimees", "temps", "temps h", "duree", "duree h", "nb heures"],
};

export function normalizeHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/gi, "oe")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[_'’\-/()]+/g, " ")
    .replace(/[^a-z0-9% ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIAS_TO_FIELD = new Map<string, Field>();
for (const field of FIELD_ORDER) {
  for (const alias of HEADER_ALIASES[field]) ALIAS_TO_FIELD.set(alias, field);
}

/** Décode les octets d'un CSV : BOM UTF-8, UTF-8 strict, sinon Windows-1252 (Excel FR). */
export function decodeTextBytes(bytes: Uint8Array): string {
  let view = bytes;
  if (view.length >= 3 && view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) view = view.subarray(3);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(view);
  } catch {
    return new TextDecoder("windows-1252").decode(view);
  }
}

function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/).slice(0, 10).join("\n");
  const counts = [";", "\t", ","].map((d) => ({ d, n: firstLines.split(d).length - 1 }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0]!.n > 0 ? counts[0]!.d : ";";
}

/** CSV → matrice (RFC 4180 : guillemets, guillemets doublés, retours à la ligne dans une cellule). */
export function parseDelimitedText(text: string, delimiter = detectDelimiter(text)): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell.trim() === "") {
      cell = "";
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

/**
 * Nombre FR ou EN : « 1 234,50 € », « 1.234,50 », « 1,234.50 », « 12,5 % », « 45 ».
 * Le dernier séparateur rencontré est le séparateur décimal. null si illisible.
 */
export function parseLocaleNumber(raw: string): number | null {
  let s = raw.replace(/[\s  €$%]/g, "").replace(/HT|TTC/gi, "");
  if (!s) return null;
  if (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(s)) return Number(s);
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? "," : ".";
    const thousands = dec === "," ? "." : ",";
    s = s.split(thousands).join("").replace(dec, ".");
  } else if (lastComma >= 0) {
    s = (s.match(/,/g)?.length ?? 0) > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if ((s.match(/\./g)?.length ?? 0) > 1) {
    s = s.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const UNIT_ALIASES: Record<string, string> = {
  m2: "m²", "m²": "m²", "m^2": "m²", mc: "m²", "metre carre": "m²", "metres carres": "m²",
  ml: "ml", "m l": "ml", m: "ml", "metre lineaire": "ml", "metres lineaires": "ml", lm: "ml",
  m3: "m³", "m³": "m³", "m^3": "m³", "metre cube": "m³", "metres cubes": "m³",
  u: "U", un: "U", unite: "U", unites: "U", pce: "U", pc: "U", piece: "U", pieces: "U", ens: "U",
  ensemble: "U", nb: "U", qte: "U",
  forfait: "forfait", ft: "forfait", fft: "forfait", ff: "forfait", forf: "forfait",
  h: "h", heure: "h", heures: "h", hr: "h",
  j: "jour", jour: "jour", jours: "jour", jr: "jour",
};

/** Unité d'import → unité de la bibliothèque (m², ml, m³, U, forfait, h, jour), sinon null. */
export function normalizeWorkUnit(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (isWorkUnit(t)) return t;
  const key = t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/[.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return UNIT_ALIASES[key] ?? UNIT_ALIASES[key.replace(/\s/g, "")] ?? null;
}

/** TVA : « 20 », « 20 % », « 0,2 » (cellule Excel au format %), « 5,5 ». */
export function parseVatRate(raw: string): number | null {
  const n = parseLocaleNumber(raw);
  if (n == null) return null;
  const pct = n > 0 && n < 1 ? Math.round(n * 1000) / 10 : n;
  return isVatRate(pct) ? pct : null;
}

export type ImportColumnMapping = Partial<Record<Field, number>>;

/** Cherche la ligne d'en-tête dans les 10 premières lignes (des lignes de titre peuvent précéder). */
function detectHeader(matrix: string[][]): { headerIndex: number; mapping: ImportColumnMapping } | null {
  for (let r = 0; r < Math.min(10, matrix.length); r++) {
    const mapping: ImportColumnMapping = {};
    matrix[r]!.forEach((cell, idx) => {
      const field = ALIAS_TO_FIELD.get(normalizeHeader(cell));
      if (field && mapping[field] === undefined) mapping[field] = idx;
    });
    if (mapping.title !== undefined && Object.keys(mapping).length >= 2) return { headerIndex: r, mapping };
  }
  return null;
}

export type WorkItemsImportResult = {
  rows: WorkItemCsvRow[];
  errors: string[];
  /** Champs reconnus → libellé de la colonne source (pour l'aperçu). */
  detectedColumns: Partial<Record<Field, string>>;
  headerFound: boolean;
  truncated: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Matrice (CSV ou XLSX) → lignes d'ouvrages validées, avec erreurs lisibles par ligne. */
export function mapWorkItemMatrix(matrix: string[][]): WorkItemsImportResult {
  const errors: string[] = [];
  if (matrix.length === 0) {
    return { rows: [], errors: ["Fichier vide."], detectedColumns: {}, headerFound: false, truncated: false };
  }

  const header = detectHeader(matrix);
  const mapping: ImportColumnMapping =
    header?.mapping ?? Object.fromEntries(FIELD_ORDER.map((f, i) => [f, i]));
  const start = header ? header.headerIndex + 1 : 0;
  const detectedColumns: Partial<Record<Field, string>> = {};
  if (header) {
    for (const [field, idx] of Object.entries(mapping) as [Field, number][]) {
      detectedColumns[field] = matrix[header.headerIndex]![idx] ?? "";
    }
  }

  const get = (cells: string[], field: Field) => {
    const idx = mapping[field];
    return idx === undefined ? "" : (cells[idx] ?? "").trim();
  };

  const rows: WorkItemCsvRow[] = [];
  let truncated = false;

  for (let r = start; r < matrix.length; r++) {
    const cells = matrix[r]!;
    const line = r + 1;
    const title = get(cells, "title");
    if (!title) {
      if (cells.some((c) => c.trim() !== "")) errors.push(`Ligne ${line} : désignation manquante, ignorée.`);
      continue;
    }
    if (rows.length >= MAX_IMPORT_ROWS) {
      truncated = true;
      break;
    }

    const unitRaw = get(cells, "unit");
    const unit = normalizeWorkUnit(unitRaw) ?? "U";
    if (unitRaw && !normalizeWorkUnit(unitRaw)) errors.push(`Ligne ${line} : unité « ${unitRaw} » remplacée par U.`);

    const vatRaw = get(cells, "default_vat_rate");
    const vat = vatRaw ? parseVatRate(vatRaw) : 20;
    if (vat == null) errors.push(`Ligne ${line} : TVA « ${vatRaw} » invalide, 20 % appliqué.`);

    const num = (field: Field, label: string): number => {
      const raw = get(cells, field);
      if (!raw) return 0;
      const n = parseLocaleNumber(raw);
      if (n == null || n < 0) {
        errors.push(`Ligne ${line} : ${label} « ${raw} » illisible, 0 appliqué.`);
        return 0;
      }
      return round2(n);
    };

    const unitPrice = num("unit_price_ht", "prix");
    if (unitPrice === 0) errors.push(`Ligne ${line} : « ${title} » sans prix (0 €).`);

    rows.push({
      reference: get(cells, "reference").slice(0, 80),
      title: title.slice(0, 300),
      description: get(cells, "description").slice(0, 2000),
      category: get(cells, "category").slice(0, 120),
      unit,
      unit_price_ht: unitPrice,
      default_vat_rate: vat ?? 20,
      labor_cost: num("labor_cost", "coût MO"),
      material_cost: num("material_cost", "coût fournitures"),
      estimated_hours: num("estimated_hours", "heures"),
    });
  }

  if (truncated) errors.push(`Import limité aux ${MAX_IMPORT_ROWS} premières lignes.`);
  return { rows, errors, detectedColumns, headerFound: header != null, truncated };
}

/** Compat : CSV texte → lignes d'ouvrages. */
export function parseWorkItemsCsv(text: string): { rows: WorkItemCsvRow[]; errors: string[] } {
  const matrix = parseDelimitedText(text);
  if (matrix.length === 0) return { rows: [], errors: ["Fichier CSV vide."] };
  const { rows, errors } = mapWorkItemMatrix(matrix);
  return { rows, errors };
}

function escapeCsvCell(value: string): string {
  if (/[";\n\r,]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Export `;` UTF-8 avec BOM : ouvert tel quel par Excel FR, réimportable sans perte. */
export function serializeWorkItemsCsv(
  rows: Array<{
    reference: string | null;
    title: string;
    description: string | null;
    category_name: string | null;
    unit: string;
    unit_price_ht: number;
    default_vat_rate: number;
    labor_cost: number;
    material_cost: number;
    estimated_hours: number;
  }>,
): string {
  const fr = (n: number) => String(n).replace(".", ",");
  const header = FIELD_ORDER.map((f) => EXPORT_HEADERS[f]).map(escapeCsvCell).join(";");
  const body = rows.map((row) =>
    [
      row.reference ?? "",
      row.title,
      row.description ?? "",
      row.category_name ?? "",
      row.unit,
      fr(row.unit_price_ht),
      fr(row.default_vat_rate),
      fr(row.labor_cost),
      fr(row.material_cost),
      fr(row.estimated_hours),
    ]
      .map(escapeCsvCell)
      .join(";"),
  );
  return `﻿${[header, ...body].join("\r\n")}`;
}
