import type { WorkItemCsvRow } from "@/lib/work-library/types";
import { isVatRate, isWorkUnit } from "@/lib/work-library/units";

const CSV_HEADERS = [
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
] as const;

function parseDecimal(raw: string): number {
  const cleaned = raw.trim().replace(",", ".").replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function escapeCsvCell(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function parseWorkItemsCsv(text: string): { rows: WorkItemCsvRow[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { rows: [], errors: ["Fichier CSV vide."] };
  }

  const delimiter = lines[0]!.includes(";") ? ";" : ",";
  const headerCells = lines[0]!.split(delimiter).map((c) => c.trim().toLowerCase());
  const hasHeader = headerCells.includes("title") || headerCells.includes("titre");
  const startIdx = hasHeader ? 1 : 0;

  const col = (cells: string[], name: string, fallbackIdx: number): string => {
    if (hasHeader) {
      const idx = headerCells.indexOf(name);
      if (idx >= 0) return cells[idx]?.trim() ?? "";
    }
    return cells[fallbackIdx]?.trim() ?? "";
  };

  const rows: WorkItemCsvRow[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const cells = lines[i]!.split(delimiter).map((c) => c.replace(/^"|"$/g, "").trim());
    const title = col(cells, "title", 1) || col(cells, "titre", 1);
    if (!title) {
      errors.push(`Ligne ${i + 1} : titre manquant.`);
      continue;
    }

    const unitRaw = col(cells, "unit", 4) || col(cells, "unite", 4) || "U";
    const unit = isWorkUnit(unitRaw) ? unitRaw : "U";
    if (!isWorkUnit(unitRaw) && unitRaw) {
      errors.push(`Ligne ${i + 1} : unité « ${unitRaw} » remplacée par U.`);
    }

    const vat = parseDecimal(col(cells, "default_vat_rate", 6) || col(cells, "tva", 6) || "20");
    const default_vat_rate = isVatRate(vat) ? vat : 20;

    rows.push({
      reference: col(cells, "reference", 0) || col(cells, "ref", 0),
      title,
      description: col(cells, "description", 2),
      category: col(cells, "category", 3) || col(cells, "categorie", 3),
      unit,
      unit_price_ht: parseDecimal(col(cells, "unit_price_ht", 5) || col(cells, "prix_ht", 5)),
      default_vat_rate,
      labor_cost: parseDecimal(col(cells, "labor_cost", 7) || col(cells, "mo", 7)),
      material_cost: parseDecimal(col(cells, "material_cost", 8) || col(cells, "fourniture", 8)),
      estimated_hours: parseDecimal(col(cells, "estimated_hours", 9) || col(cells, "heures", 9)),
    });
  }

  return { rows, errors };
}

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
  const header = CSV_HEADERS.join(";");
  const body = rows.map((row) =>
    [
      row.reference ?? "",
      row.title,
      row.description ?? "",
      row.category_name ?? "",
      row.unit,
      String(row.unit_price_ht).replace(".", ","),
      String(row.default_vat_rate).replace(".", ","),
      String(row.labor_cost).replace(".", ","),
      String(row.material_cost).replace(".", ","),
      String(row.estimated_hours).replace(".", ","),
    ]
      .map(escapeCsvCell)
      .join(";"),
  );
  return [header, ...body].join("\n");
}
