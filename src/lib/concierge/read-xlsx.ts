import { inflateRawSync } from "node:zlib";

/**
 * Lecteur XLSX minimal, sans dépendance (les bibliothèques courantes tirent des
 * dépendances vulnérables). Lit la PREMIÈRE feuille en lignes { en-tête: valeur }.
 * Garde-fous « zip bomb » : taille décompressée bornée par entrée et au total.
 * Usage : import admin de prospects (fichier de confiance moyenne, taille ≤ 4 Mo).
 */

const MAX_ENTRY_BYTES = 40 * 1024 * 1024;
const MAX_TOTAL_BYTES = 80 * 1024 * 1024;

type ZipEntry = { name: string; method: number; compressedSize: number; size: number; offset: number };

function listEntries(buf: Buffer): ZipEntry[] {
  // Fin du répertoire central (EOCD), cherchée depuis la fin (commentaire ≤ 64 Ko).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("xlsx_invalid");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error("xlsx_invalid");
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.push({ name, method, compressedSize, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(buf: Buffer, e: ZipEntry, budget: { left: number }): string {
  if (e.size > MAX_ENTRY_BYTES || e.size > budget.left) throw new Error("xlsx_too_large");
  const h = e.offset;
  if (h + 30 > buf.length || buf.readUInt32LE(h) !== 0x04034b50) throw new Error("xlsx_invalid");
  const start = h + 30 + buf.readUInt16LE(h + 26) + buf.readUInt16LE(h + 28);
  const data = buf.subarray(start, start + e.compressedSize);
  let out: Buffer;
  if (e.method === 0) out = Buffer.from(data);
  else if (e.method === 8) out = inflateRawSync(data, { maxOutputLength: Math.min(MAX_ENTRY_BYTES, budget.left) });
  else throw new Error("xlsx_unsupported");
  budget.left -= out.length;
  return out.toString("utf8");
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

/** Texte d'un nœud <si> / <is> (texte simple ou enrichi en plusieurs <t>). */
function richText(xml: string): string {
  let out = "";
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  return decodeXml(out);
}

function colIndex(ref: string): number {
  const letters = ref.replace(/\d+$/, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function readXlsxRows(file: Buffer, maxRows = 5000): Record<string, string>[] {
  const entries = listEntries(file);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const budget = { left: MAX_TOTAL_BYTES };
  const read = (name: string) => {
    const e = byName.get(name);
    return e ? readEntry(file, e, budget) : null;
  };

  const shared: string[] = [];
  const sst = read("xl/sharedStrings.xml");
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(richText(m[1]!));

  // Première feuille du classeur (ordre du workbook), via les relations.
  let sheetPath = "xl/worksheets/sheet1.xml";
  const wb = read("xl/workbook.xml");
  const rels = read("xl/_rels/workbook.xml.rels");
  const firstRid = wb?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  if (firstRid && rels) {
    const target = rels.match(new RegExp(`<Relationship\\b[^>]*Id="${firstRid}"[^>]*Target="([^"]+)"`))?.[1]
      ?? rels.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${firstRid}"`))?.[1];
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  const sheet = read(sheetPath);
  if (!sheet) throw new Error("xlsx_no_sheet");

  const matrix: string[][] = [];
  for (const row of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    if (matrix.length > maxRows) break;
    const cells: string[] = [];
    for (const c of row[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1] ?? "";
      const inner = c[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const idx = ref ? colIndex(ref) : cells.length;
      if (idx < 0 || idx > 512) continue;
      let value = "";
      if (type === "inlineStr") value = richText(inner);
      else {
        const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (v != null) value = type === "s" ? (shared[Number(v)] ?? "") : decodeXml(v);
      }
      cells[idx] = value;
    }
    matrix.push(cells);
  }

  const [headers, ...data] = matrix;
  if (!headers) return [];
  return data
    .filter((r) => r.some((v) => v && v.trim() !== ""))
    .slice(0, maxRows)
    .map((r) => Object.fromEntries(headers.map((h, i) => [String(h ?? "").trim(), String(r[i] ?? "").trim()])));
}
