import { computeDebourseSec } from "@/lib/work-library/pricing";
import type { WorkItemWithCategory } from "@/lib/work-library/types";

export type WorkItemSortKey = "title" | "category" | "unit" | "price" | "vat" | "debourse" | "created";
export type SortDirection = "asc" | "desc";
export type WorkItemSort = { key: WorkItemSortKey; dir: SortDirection };

export const DEFAULT_WORK_ITEM_SORT: WorkItemSort = { key: "title", dir: "asc" };

/** Sens proposé au premier clic : texte A→Z, montants et dates du plus grand au plus petit. */
export const FIRST_CLICK_DIRECTION: Record<WorkItemSortKey, SortDirection> = {
  title: "asc",
  category: "asc",
  unit: "asc",
  price: "desc",
  vat: "desc",
  debourse: "desc",
  created: "desc",
};

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

function value(item: WorkItemWithCategory, key: WorkItemSortKey): string | number | null {
  switch (key) {
    case "title":
      return item.title;
    case "category":
      return item.category_name;
    case "unit":
      return item.unit;
    case "price":
      return item.unit_price_ht;
    case "vat":
      return item.default_vat_rate;
    case "debourse":
      return computeDebourseSec(item.material_cost, item.labor_cost);
    case "created":
      return item.created_at ? Date.parse(item.created_at) : null;
  }
}

/** Tri stable ; valeurs vides toujours en fin de liste ; égalités départagées par désignation. */
export function sortWorkItems(items: WorkItemWithCategory[], sort: WorkItemSort): WorkItemWithCategory[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const va = value(a, sort.key);
    const vb = value(b, sort.key);
    const emptyA = va == null || va === "";
    const emptyB = vb == null || vb === "";
    if (emptyA !== emptyB) return emptyA ? 1 : -1;
    let cmp = 0;
    if (!emptyA) cmp = typeof va === "number" && typeof vb === "number" ? va - vb : collator.compare(String(va), String(vb));
    return cmp * sign || collator.compare(a.title, b.title);
  });
}

/** Clic sur une colonne : même colonne → inverse le sens ; autre colonne → sens par défaut de la colonne. */
export function nextSort(current: WorkItemSort, key: WorkItemSortKey): WorkItemSort {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: FIRST_CLICK_DIRECTION[key] };
}

export function isWorkItemSort(v: unknown): v is WorkItemSort {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return typeof s.key === "string" && s.key in FIRST_CLICK_DIRECTION && (s.dir === "asc" || s.dir === "desc");
}
