import { describe, expect, it } from "vitest";

import type { WorkItemWithCategory } from "@/lib/work-library/types";

import { isWorkItemSort, nextSort, sortWorkItems } from "./sort-work-items";

const base: WorkItemWithCategory = {
  id: "",
  user_id: "u",
  category_id: null,
  reference: null,
  title: "",
  description: null,
  unit: "U",
  unit_price_ht: 0,
  default_vat_rate: 10,
  labor_cost: 0,
  material_cost: 0,
  estimated_hours: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  category_name: null,
};
const w = (p: Partial<WorkItemWithCategory>): WorkItemWithCategory => ({ ...base, ...p });

const items = [
  w({ id: "a", title: "Évier", unit_price_ht: 120, category_name: "Plomberie", created_at: "2026-03-01T00:00:00Z" }),
  w({ id: "b", title: "dalle 12 cm", unit_price_ht: 80, category_name: null, created_at: "2026-05-01T00:00:00Z" }),
  w({ id: "c", title: "Dalle 2 cm", unit_price_ht: 80, category_name: "Maçonnerie", labor_cost: 30, material_cost: 20 }),
];

describe("sortWorkItems", () => {
  it("trie la désignation sans tenir compte des accents, de la casse et en ordre numérique", () => {
    expect(sortWorkItems(items, { key: "title", dir: "asc" }).map((i) => i.id)).toEqual(["c", "b", "a"]);
  });

  it("prix décroissant, égalités départagées par désignation", () => {
    expect(sortWorkItems(items, { key: "price", dir: "desc" }).map((i) => i.id)).toEqual(["a", "c", "b"]);
  });

  it("catégorie vide toujours en dernier, quel que soit le sens", () => {
    expect(sortWorkItems(items, { key: "category", dir: "asc" }).at(-1)?.id).toBe("b");
    expect(sortWorkItems(items, { key: "category", dir: "desc" }).at(-1)?.id).toBe("b");
  });

  it("ajoutés récemment d'abord", () => {
    expect(sortWorkItems(items, { key: "created", dir: "desc" })[0]?.id).toBe("b");
  });

  it("déboursé = MO + fournitures", () => {
    expect(sortWorkItems(items, { key: "debourse", dir: "desc" })[0]?.id).toBe("c");
  });
});

describe("nextSort / isWorkItemSort", () => {
  it("inverse sur la même colonne, sens par défaut sur une autre", () => {
    expect(nextSort({ key: "title", dir: "asc" }, "title")).toEqual({ key: "title", dir: "desc" });
    expect(nextSort({ key: "title", dir: "asc" }, "price")).toEqual({ key: "price", dir: "desc" });
  });

  it("valide une valeur relue du stockage local", () => {
    expect(isWorkItemSort({ key: "price", dir: "asc" })).toBe(true);
    expect(isWorkItemSort({ key: "hack", dir: "asc" })).toBe(false);
    expect(isWorkItemSort(null)).toBe(false);
  });
});
